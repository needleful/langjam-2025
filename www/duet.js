// duet.js

function makeChild(parent, tag, attributes) {
	let item = document.createElement(tag);
	parent.appendChild(item);
	if (attributes) {
		Object.keys(attributes).map(function(key) {
			item.setAttribute(key, attributes[key]);
		});
	}
	return item;
}

const Type = {
	real: 0,
	integer: 1,
	function: 2,
	type: 3,
	boolean: 4,
	string: 5,
	entity: 6,
	program: 7,
};

let TypeNames = {};

const Update = {
	once: 0,
	variable: 1,
	message: 2,
	frame: 3,
};

let UpdateNames = {};

const Storage = {
	global: 0,
	instance: 1,
};

let StorageNames = {};

const VM = {
	constant: 0,
	local: 1, 
	call: 2,
	callAsync: 3,
	array: 4,
	read: 5,
};

let VMNames = {};

const VMLength = {
	[[VM.constant]]: 2,
	[[VM.local]]: 2, 
	[[VM.call]]: 3,
	[[VM.callAsync]]: 3,
	[[VM.array]]: 2,
	[[VM.read]]: 2,
};

const opCore = {
	add: (a, b) => {
		return a + b;
	},
	sub: (a, b) => {
		return a - b;
	},
	mul: (a, b) => {
		return a*b;
	},
	div: (a, b) => {
		return a/b;
	},
	clamp: (x, min, max) => {
		if(x < min) {
			return min;
		}
		if(x > max) {
			return max;
		}
		return x;
	}
}

function opVV(op) {
	return function(as, bs) {
		let r = [];
		r.length = bs.length;
		for(let i = 0; i < bs.length; i++) {
			r[i] = op(as[i], bs[i]);
		}
		return r;
	};
}
function opSV(op) {
	return function(a, bs) {
		let r = [];
		r.length = bs.length;
		for(let i = 0; i < bs.length; i++) {
			r[i] = op(a, bs[i]);
		}
		return r;
	};
}
function opVS(op) {
	return function(as, b) {
		let r = [];
		r.length = as.length;
		for(let i = 0; i < as.length; i++) {
			r[i] = op(as[i], b);
		}
		return r;
	};
}

function binGen(type, op) {
	return {
		type: Type.function,
		return: type,
		args: [type, type],
		ss: op,
		sv: opSV(op),
		vv: opVV(op),
		vs: opVS(op)
	}
}

function unGen(type, op) {
	let r = {
		type: Type.function,
		return: type,
		args: [type],
		s: op,
		v: (a) => a.map(op)
	}
}

function opVSS(op) {
	return function(as, b, c) {
		let r = [];
		r.length = as.length;
		for(let i = 0; i < as.length; i++) {
			r[i] = op(as[i], b, c);
		}
		return r;
	}
}

function opVVV(op) {
	return function(as, bs, cs) {
		let r = [];
		r.length = as.length;
		for(let i = 0; i < as.length; i++) {
			r[i] = op(as[i], bs[i], cs[i]);
		}
		return r;
	}
}


const Duet = {
	// A dictionary
	// name of object/file -> {path:String, text:String, type:String, element:Element}
	canvas: undefined,
	files: {},
	activeFile: undefined,
	program: undefined,
	entities: {},
	promises: {
		waiting: [],
		results: []
	},
	overloads: {
		clamp: {
			overload: 'clamp',
			baseType: Type.real,
			argCount: 3,
			vector: 'opv',
			scalar: 'ops'
		}
	},
	// Our "standard library"
	platform: {
		image: {type: Type.type},
		ops: {
			add:binGen(Type.real, opCore.add),
			sub:binGen(Type.real, opCore.sub),
			mul:binGen(Type.real, opCore.mul),
			div:binGen(Type.real, opCore.div),
			clamp: {
				type: Type.function,
				return: Type.real,
				args: [Type.real, Type.real, Type.real],
				sss: opCore.clamp,
				vss: opVSS(opCore.clamp),
				vvv: opVVV(opCore.clamp)
			}
		},
		opv: {
			addv:binGen([Type.real], opVV(opCore.add)),
			subv:binGen([Type.real], opVV(opCore.sub)),
			mulv:binGen([Type.real], opVV(opCore.mul)),
			divv:binGen([Type.real], opVV(opCore.div)),

			adds:binGen([Type.real], opVS(opCore.add)),
			subs:binGen([Type.real], opVS(opCore.sub)),
			muls:binGen([Type.real], opVS(opCore.mul)),
			divs:binGen([Type.real], opVS(opCore.div)),

			addsv:binGen([Type.real], opSV(opCore.add)),
			subsv:binGen([Type.real], opSV(opCore.sub)),
			mulsv:binGen([Type.real], opSV(opCore.mul)),
			divsv:binGen([Type.real], opSV(opCore.div)),

			clamp: {
				type: Type.function,
				return: [Type.real],
				args: [[Type.real],[Type.real],[Type.real]],
				sss: opVVV(opCore.clamp),
				vss: opVSS(opVVV(opCore.clamp)),
				vvv: opVVV(opVVV(opCore.clamp))
			}
		},
		canvas: {
			clearcolor: {
				type: [Type.real, 3],
				update: Update.once,
				value: [1,1,1]
			},
			size: {
				type: [Type.real, 2],
				update: Update.once,
				get:() => {
					let c = Duet.canvas;
					return [c.width, c.height];
				}
			},
			drawsprite: {
				sv: (image, positions) => {
					for(let pos of positions) {
						//console.log('Drawing:', image, pos, [image.width, image.height]);
						let center = [image.width/2, image.height/2];
						Duet.draw2d.drawImage(
							image, pos[0] - center[0], pos[1] - center[1],
							image.width, image.height
						);
					}
				}
			}
		},
		paused: {
			type: Type.boolean,
			update: Update.variable,
			value: false
		},
		time: {
			frame: {
				type: Type.integer,
				update: Update.frame,
				value: 0
			},
			deltams: {
				type: Type.integer,
				update: Update.once,
				value: 16
			},
		},
		file: {
			loadsprite: {
				type: Type.function,
				async: true,
				update: Update.once,
				args: [Type.string],
				return: 'image',
				s: (path) => {
					return new Promise((resolve, reject) => {
						const img = new Image();
						img.onload = () => {
							console.log('Image Loaded:', path);
							document.getElementById('loaded-images').appendChild(img);
							resolve(img);
						}
						img.onerror = () => {
							console.error('Failed to load image: ', path);
							reject();
						}
						img.src = path;
					});
				}
			},
		},
		input: {
			right: {
				type: Type.integer,
				update: Update.frame,
				value: 0
			},
			left: {
				type: Type.integer,
				update: Update.frame,
				value: 0
			},
			up: {
				type: Type.integer,
				update: Update.frame,
				value: 0
			},
			down: {
				type: Type.integer,
				update: Update.frame,
				value: 0
			}
		},
		create: {
			type: Type.entity,
			c: (typename, count = 1, refer = false) => {
				console.log(`Creating ${count} instances of: ${typename}`);
				let et = Duet.entities[typename];
				let startId = et.count + et.toCreate - et.toFree;
				et.toCreate += count;
				// Create a permanent reference to this node.
				function getRef(id) {
					if(et.freelist.length) {
						let ref = et.freelist.pop();
						et.references[ref] = id;
						return ref;
					}
					else {
						let ref = et.references.length;
						et.references.push(id);
						return ref;
					}
				}
				if(refer) {
					if(count == 1) {
						return getRef(startId);
					}
					else {
						let refs = [];
						refs.length = count;
						for(let i = 0; i < count; i++) {
							refs[i] = getRef(startId + i);
						}
						return refs;
					}
				}
				else {
					return startId;
				}
			}
		}
	},

	// Set once per script
	entities: {},
	messages: [],
	press: (e) => {
		Duet._keySet(e.key, 1);
	},
	_keySet: (key, val) => {
		switch(key) {
		case "ArrowUp":
			Duet.platform.input.up.value = val;
			break;
		case "ArrowDown":
			Duet.platform.input.down.value = val;
			break;
		case "ArrowLeft":
			Duet.platform.input.left.value = val;
			break;
		case "ArrowRight":
			Duet.platform.input.right.value = val;
			break;
		}
	},
	release: (e) => {
		Duet._keySet(e.key, 0);
	},

	instr: (typename, stack, code, pointer) => {
		let instr = code[pointer];
		if(!(instr in VMLength)) {
			console.error('Not an instruction:', instr, code, pointer);
			return false;
		}
		function arg(i) {
			return code[pointer + i];
		}

		switch(instr) {
		case VM.constant: {
			stack.push(arg(1));
			break;
		}
		case VM.local: {
			stack.push(Duet.entities[typename].values[arg(1)]);
			break;
		}
		// A refernce to a platform variable
		case VM.read: {
			stack.push(arg(1).value);
			break;
		}
		case VM.call: {
			let fn = arg(1);
			if(typeof(fn) !== 'function') {
				console.error('Expected a function: ', fn, code, pointer);
				return false;
			}
			let args = [];
			args.length = arg(2);
			for(let i = 0; i < args.length; i++) {
				args[args.length - 1 - i] = stack.pop();
			}
			stack.push(fn(...args));
			break;
		}
		case VM.callAsync: {
			let fn = arg(1);
			if(typeof(fn) !== 'function') {
				console.error('Expected a function: ', fn, code, pointer);
				return false;
			}
			let args = [];
			args.length = arg(2);
			for(let i = 0; i < args.length; i++) {
				args[args.length - 1 - i] = stack.pop();
			}
			let promise = fn(...args);
			let id = Duet.promises.length;
			Duet.promises.waiting.push(promise.then((value) => {
				Duet.promises.results[id] = value;
			}));
			stack.push({_promise: id});
			break;
		}
		case VM.array: {
			let result = [];
			result.length = arg(1);
			for(let i = 0; i < result.length; i++) {
				result[result.length - 1 - i] = stack.pop();
			}
			stack.push(result);
			break;
		}
		default:
			console.error('Not an instruction: ', instr);
			return false;
		}
		return true;
	},

	eval: (typename, code) => {
		if(typeof(typename) != 'string') {
			console.error('Typename expected');
		}
		let stack = [];
		for(
			let pointer = 0;
			pointer < code.length;
			pointer += VMLength[code[pointer]]
		) {
			if(!Duet.instr(typename, stack, code, pointer))
			{
				break;
			}
		}
		if(stack.length) {
			return stack.pop();
		}
		else {
			return null;
		}
	},

	allocate: (typename) => {
		if(!(typename in Duet.entities)) {
			console.error('No such entity type: ', typename);
		}
		let e = Duet.entities[typename];
		for(let alloc of e.compute.allocation) {
			let varname = alloc[0];
			e.values[varname] = Duet.eval(typename, alloc[1]);
		}
	},

	run: () => {
		Duet.draw2d = Duet.canvas.getContext('2d');
		// Default events
		Duet.canvas.onkeydown = Duet.press;
		Duet.canvas.onkeyup = Duet.release;

		// Creation of the program and loading entity types
		for(let type in Duet.entities) {
			Duet.allocate(type)
		}
		Duet.platform.create.c(Duet.program, 1);

		setTimeout(Duet.frame, Duet.platform.time.deltams.value);
	},
	frame: async () => {
		// Begin the frame
		if(Duet.promises.waiting.length) {
			await Promise.all(Duet.promises.waiting);
		}
		let messages = [];
		{
			let cc = Duet.platform.canvas.clearcolor.value;
			Duet.draw2d.fillstyle = `rgb(${255*cc[0]}, ${255*cc[1]}, ${255*cc[2]})`;
			Duet.draw2d.fillRect(0, 0, Duet.canvas.width, Duet.canvas.height);
		}

		for(let typename in Duet.entities) {
			// Entity creation
			let type = Duet.entities[typename];

			if(Duet.promises.waiting.length) {
				for(let v in type.values) {
					if(typeof(type.values[v]) === 'object' && '_promise' in type.values[v]) {
						let id = type.values[v]._promise;
						type.values[v] = Duet.promises.results[id];
						console.log(`Promise fulfilled: ${typename}.${v} = ${type.values[v]}`);
					}
				}
			}

			type.count -= type.toFree;
			if(type.toCreate) {
				for(let val of type.compute.creation) {
					let valname = val[0];
					let start = type.values[valname].length;
					type.values[valname].length += type.toCreate;
					let init = Duet.eval(typename, val[1]);
					for(let i = start; i < start + type.toCreate; i++) {
						let val = init;
						if(Array.isArray(init)) {
							val = [...init];
						}
						type.values[valname][i] = val;
					}
					console.log(`Creation: ${typename}.${valname}: ${type.values[valname]}`); 
				}
			}
			type.toFree = 0;
			type.toCreate = 0;

			for(let t in Duet.entities) {
				let type = Duet.entities[t];
			}

			// Running in the frame
			for(let val of type.compute.frame) {
				let valname = val[0];
				let value = Duet.eval(typename, val[1]);
				type.values[valname] = value;
				if(valname in type.events) {
					let events = type.events[valname];
					for(let event of events) {
						if('condition' in event) {
							let val = Duet.eval(typename, event.condition);
							if(!val) {
								continue;
							}
						}
						messages.push([typename, event.do]);
					}
				}
			}
		}
		for(let message of messages) {
			Duet.eval(message[0], message[1]);
		}
		messages = [];
		Duet.promises.waiting = [];
		Duet.promises.results = [];

		// End the frame
		Duet.platform.time.frame.value += 1;
		if(!Duet.getPaused()) {
			setTimeout(Duet.frame, Duet.platform.time.deltams.value);
		}
	},
	setPaused: (p) => {
		Duet.platform.paused.value = p;
		if(!p) {
			Duet.frame();
		}
	},
	getPaused: () => {
		return Duet.platform.paused.value;
	},
	switchTo: (name) => {
		Duet.updateText();
		if(name in Duet.files) {
			Duet.activeFile = name;
			var file = Duet.files[name];
			document.getElementById('current-file').innerText = name;
			editor.setContent(file.text);
			if(file.tokens) {
				Duet.highlight();
			}
			else {
				Duet.lex(false);
			}
			if(file.parseTree) {
				Duet.showParseResults();
			}
		}
		else{
			console.error('DUET: could not switch to file: ', name);
		}
	},
	loadObject: async (path) => {
		const response = await fetch(path);
		if(!response.ok) {
			console.error('DUET: could not load file: ', path);
			return;
		}
		console.log('DUET: loading ', path);
		let id = path;
		Duet.addObject(id, {
			type:"Beats Me",
			path: path,
			text: await response.text()
		}, false);
	},
	addObject: (id, info, p_switch = true) => {
		if(id in Duet.files) {
			console.error('Duplicate file name: ', id);
			return;
		}
		let item = makeChild(
			document.getElementById('files-list'),
			'li', {class: 'files-list-item'});
		let button = makeChild(item, 'button');
		button.innerText = id;
		button.addEventListener('click', () => {Duet.switchTo(id)});
		info.element = button;
		Duet.files[id] = info;
		if(p_switch) {
			Duet.switchTo(id);
		}
	},
	removeObject: (name) => {
		if(name in Duet.files) {
			Duet.files[name].element.remove();
			delete Duet.files[name];
			console.log('DUET: removed: ', name);
		}
		else {
			console.warn('DUET: No such object: ', name);
		}
	},
	updateText:() => {
		if(Duet.activeFile in Duet.files) {
			Duet.files[Duet.activeFile].text = editor.text.value;
		}
	},
	lex: (lex_all = true) => {
		Duet.updateText();
		if(lex_all) {
			for(f in Duet.files) {
				var file = Duet.files[f];
				file.tokens = Duet.tokenize(file.text);
			}
		}
		else {
			var file = Duet.files[Duet.activeFile];
			file.tokens = Duet.tokenize(file.text);
		}
		Duet.highlight();
	},
	parseAll() {
		for(f in Duet.files) {
			Duet.files[f].parseTree = Duet.parse(Duet.files[f]);
		}
		Duet.showParseResults();
	},
	getScriptName: (analysis)=> {
		return analysis.type[1];
	},
	analyzeAll() {
		Duet.program = null;
		Duet.entityFiles = {};
		Duet.entities = {};

		const testAnalysis = {
			'/duet/game.duet': {
				type: [Type.program, 'game'],
				source: '/duet/game.duet',
				count: 0,
				// Number to create/free next frame
				toCreate: 0,
				toFree: 0,
				compute: {
					allocation: [
						['myplayer', [
							VM.constant, 'player',
							VM.constant, 1,
							VM.constant, true,
							VM.call, Duet.platform.create.c, 3
						]]
					],
					creation: [],
					frame: []
				},
				values: {
					myplayer: null,
				},
				events: {},
				references: [],
				freelist: []
			},
			'/duet/player.duet': {
				type: [Type.entity, 'player'],
				source: '/duet/player.duet',
				count: 0,
				// Number to create/free next frame
				toCreate: 0,
				toFree: 0,
				// Describes when to recompute each value, and the order to do it.
				compute: {
					// When the entity class is allocated for the first time
					allocation: [
						// Values are evaluated by a list of instructions on a stack-based VM thing
						['sprite', [
							// VM.call, function reference, number of arguments (or 0 if omitted)
							VM.constant, '/assets/player.png',
							// VM.constant, value
							VM.callAsync, Duet.platform.file.loadsprite.s, 1
						]],
						['speed', [VM.constant, 5.0]]
					],
					// Computed upon entity is creation, for just the created value
					creation: [
						['position', [
							VM.call, Duet.platform.canvas.size.get, 0,
							VM.constant, 2,
							VM.call, Duet.platform.opv.divs.ss, 2
						]]
					],
					// Changes every frame, for every entity
					frame: [
						['movement', [
							VM.read, Duet.platform.input.right,
							VM.read, Duet.platform.input.left,
							VM.call, Duet.platform.ops.sub.ss, 2,
							
							VM.read, Duet.platform.input.down,
							VM.read, Duet.platform.input.up,
							VM.call, Duet.platform.ops.sub.ss, 2,

							VM.array, 2
						]], 
						['position', [
							VM.local, 'movement',
							VM.local, 'speed',
							VM.call, Duet.platform.opv.muls.ss, 2,
							VM.local, 'position',
							VM.call, Duet.platform.opv.addv.sv, 2,
							VM.constant, [0,0],
							VM.call, Duet.platform.canvas.size.get, 0,
							VM.call, Duet.platform.opv.clamp.vss, 3
						]]
					],
					// A set of variables that only change when their dependencies change, which is not every frame
					// none for this example
					listening: [],
					// Variables that receive their value as a message
					// None for this example
					message: [],
				},
				values: {
					// Globals are initialized to default values based on type
					speed: 0.0,
					sprite: null,
					movement: [0,0],
					// Instance variables start as an empty array
					position: []
				},
				events: {
					position: [
						{do: [
							VM.local, 'sprite', 
							VM.local, 'position',
							VM.call, Duet.platform.canvas.drawsprite.sv, 2,
						]}
					]
				},
				// External references will need a layer of indirection, since they can be reorganized when objects are removed
				// This emulates the reference from the game to the player
				references: [0],
				// Free references. Indeces into a list of indeces into the entities table
				freelist: []
			}
		};

		for(f in Duet.files) {
			//let result = {entity: testAnalysis[f], errors:[]};
			let result = Duet.analyze(f);
			let d = result.entity;
			Duet.logParseErrors(result.errors, Duet.files[f].tokens);
			let typeName = d.type[1];
			if(d.type[0] == Type.program) {
				if(Duet.program) console.error('Cannot have multiple programs.');
				else Duet.program = typeName;
			}
			Duet.files[f].name = d;
			Duet.entities[typeName] = d;
		}
	},
	compileAndRun: () => {
		Duet.compile();
		Duet.run();
	},
	compile: () => {
		console.log('DUET: Compiling');
		Duet.lex();
		Duet.parseAll();
		Duet.analyzeAll();
	},
	highlight:() => {
		function span(parent, text, style) {
			let elem = document.createElement("span");
			if(parent) {
				parent.appendChild(elem);
			}
			if(style) {
				elem.className = style;
			}
			elem.innerText = text;
			return elem;
		}
		function assert(cond, message, data) {
			if(!cond){
				if(data) {
					console.error("Assertion context:", data);
				}
				throw new Error("ASSERT FAILED: "+ message);
			}
		}
		let text = Duet.files[Duet.activeFile].text;
		let view = document.getElementById("highlighting-content");
		view.innerText = '';
		let c = 0;
		for(let token of Duet.files[Duet.activeFile].tokens) {
			// Text BETWEEN tokens, basically just spaces.
			if(token.start > c) {
				span(view, text.substr(c, token.start - c));
			}
			token.span = span(view,
				text.substr(token.start, token.length),
				'code-'+Duet.TokenNames[token.type]);
			c = token.start + token.length;
		}
		sync_scroll();
	},
	logParseErrors:(errors, tokens) => {
		for(let err of errors) {
			console.error('Error: ', err.message, 'at token: ', err.start);
			for(let i = err.start; i < err.start+err.length; i++) {
				if(!(i in tokens)) continue;
				if(!tokens[i].span) continue;
				tokens[i].span.classList.add('code-error');
			}
		}
	},
	showParseResults:() => {
		var f = Duet.files[Duet.activeFile];
		var result = f.parseTree;
		var tokens = f.tokens;
		function processTree(node) {
			for(let i = node.start; i < node.start+node.length;i++) {
				if(!(i in tokens)) continue;
				tokens[i].span.classList.add('code-'+Duet.ParseNodeNames[node.type]);
			}
			if('children' in node) {
				node.children.map(processTree);
			}
		}
		processTree(result.node);
		Duet.logParseErrors(result.errors, tokens);
	},
	createFile:() => {
		var name = document.getElementById('new-file-name').value;
		Duet.addObject(name, {
			type:"Beats Me",
			path: name,
			text: `# New file: ${name}`
		});
	},
	Token: {
		// Identifiers
		ident: 0,
		// Any known operator
		operator: 1,
		// Numbers and underscores (see regex)
		digits: 2,
		// [
		bracketStart: 3,
		// ]
		bracketEnd: 4,
		// (
		parenStart: 5,
		// )
		parenEnd: 6,
		// Any leading whitespace (used for a class of things)
		indentation: 7,
		comma: 8,
		semicolon: 9,
		// One or more newline characters and any lines with only whitespace
		// exluding the leading indentation
		newline: 10,
		// string quote
		quote: 11,
		// Comment character and text
		comment: 12,
		period: 13,
		// Exponent component of number (+/-e)
		numExp: 14,
		stringText: 15,
		escapedStringText: 16,
		// For passing failures to the editor
		invalid: 17
	},
	TokenNames: {},
	// A list of dictionaries
	// {
	//	type: one of Duet.Token,
	//	start: int,
	//	length: int
	// }
	tokenize:(text) => {
		const r_ident = /^\p{Alpha}[\p{Alpha}\d_]*/u;
		const r_digits = /^\d(_?\d)*/;
		const r_exp = /^[eE][+\-]/;
		const r_comment = /^\#.*(\n|$)/;
		const r_newline = /^(\s*[\n\r])+/;
		const r_indent = /^\t+/;
		// For now, just single-character escapes
		const r_escaped = /^\\./;
		// catch-all for any non-alphanumeric and non-whitespace characters
		const r_operator = /^[^\s\d\p{Alpha}_]+/u;
		const r_text = /^[^\'\\]+/;

		// Current character
		var c = 0;
		var tokens = [];
		var lowText = text.toLowerCase();

		function isGood() {
			return c < text.length;
		}
		function addToken(type, length) {
			tokens.push({
				type: type,
				start: c,
				length: length
			});
			c += length;
		}
		function skipSpaces(){
			let m = text.substr(c).match(/^\u0020+/);
			if(m) {
				c += m[0].length;
			}
		}
		function grabString(token, string, skipSpace = true) {
			if(skipSpace) skipSpaces();
			if(!isGood()) {
				return false;
			}
			if(lowText.startsWith(string, c)) {
				addToken(token, string.length);
				return true;
			}
			else {
				return false;
			}
		}
		function grabRegex(token, regex, skipSpace = true) {
			if(skipSpace) skipSpaces();
			if(!isGood()) {
				return false;
			}
			var m = text.substr(c).match(regex);
			if(m) {
				addToken(token, m[0].length);
				return true;
			}
			else {
				return false;
			}
		}

		while(isGood()) {
			if(grabRegex(Duet.Token.digits, r_digits)) {
				grabRegex(Duet.Token.numExp, r_exp);
				continue;
			}
			// For now, multi-line strings are allowed
			if(grabString(Duet.Token.quote, '\'')) {
				while(isGood() && !grabString(Duet.Token.quote, '\'')) {
					(grabRegex(Duet.Token.escapedStringText, r_escaped)
						|| grabRegex(Duet.Token.stringText, r_text));
				}
				continue;
			}
			if(grabRegex(Duet.Token.ident, r_ident)
			|| grabRegex(Duet.Token.newline, r_newline)
			|| grabRegex(Duet.Token.indentation, r_indent)
			|| grabString(Duet.Token.bracketStart, '[')
			|| grabString(Duet.Token.bracketEnd, ']')
			|| grabString(Duet.Token.parenStart, '(')
			|| grabString(Duet.Token.parenEnd, ')')
			|| grabString(Duet.Token.comma, ',')
			|| grabString(Duet.Token.period, '.')
			|| grabString(Duet.Token.semicolon, ';')
			|| grabRegex(Duet.Token.comment, r_comment)
			|| grabRegex(Duet.Token.operator, r_operator)
			){
				continue;
			}
			else {
				addToken(Duet.Token.invalid, 1);
				console.error('Invalid token: ', text.substr(c, 5));
			}
		}

		return tokens;
	},
	ParseNode: {
		error: 0,
		script: 1,
		header: 2,
		binding: 3,
		event: 4,
		accessor: 5,
		number: 6,
		valueList: 7,
		declaration: 8,
		expression: 9,
		declVar: 10,
		declFunction: 11,
		declTuple: 12,
		param: 13,
		operator: 15,
		funCall: 16,
		string: 17,
		condition: 18,
	},
	ParseNodeNames: {},
	// Parse nodes will be a dictionary of
	//	type: Duet.ParseNode
	//	start: int (index of first token)
	//	length: int (total tokens)
	//	children: parseNode[] (recursive structure)
	parse: (file)=> {
		const opPrecedence = {
			primary:0,
			'^':1, '*':2, '/':2,
			'+':3, '-':3,
			'%':4,
			'<':5, '<=':5, '>=':5, '>':5, '==':5, '!=':5,
			'!':6, '&':7, '|':8
		};
		const unaryOps = [
			'+', '-', '!'
		];

		let tk = 0;
		let errors = [];
		let tokens = file.tokens;
		let lowText = file.text.toLowerCase();

		function newNode(type, length = 0, offset = 0) {
			var n = {
				type: type,
				children: [],
				start: tk + offset,
				length: length
			};
			return n;
		}

		function parseError(text, length = 1, offset = 0) {
			var e = {start: tk + offset, length: length, message: text};
			errors.push(e);
			tk += length + offset;
			let n = newNode(Duet.ParseNode.error, length);
			n.start = e.start;
			n.length = e.length;
			return n;
		}
		function tkText(token) {
			return lowText.substr(token.start, token.length);
		}

		function grow(node, amount = 0) {
			if(amount == 0) {
				amount = tk - node.start - node.length;
			}
			node.length += amount;
			return node;
		}

		function isGood() {
			return tk < tokens.length;
		}

		function peek() {
			return tokens[tk];
		}

		function grab(type) {
			if(!isGood()) {
				return false;
			}
			let token = peek();
			if(token.type == type) {
				tk++;
				return token;
			}
			else {
				return false;
			}
		}

		function grabText(type, string) {
			let start = tk;
			let token = grab(type);
			if(!token || tkText(token) != string) {
				tk = start;
				return false;
			}
			return token;
		}

		function skipIgnored() {
			while(grab(Duet.Token.comment) || grab(Duet.Token.newline)) {
				;;
			}
		}

		function header() {
			let h = newNode(Duet.ParseNode.header);
			let type = grab(Duet.Token.ident);
			if(!type) {
				return parseError('The script should start with a type and name');
			}
			let typeName = tkText(type);
			if(typeName != 'program' && typeName != 'entity') {
				return parseError(`The type of a script must be either [program] or [entity], found [${typeName}]`);
			}

			let name = grab(Duet.Token.ident);
			if(!name) {
				return parseError('We need a unique name for each script after its type');
			}

			return grow(h);
		}

		function listOf(fn) {
			let result = [];
			while(isGood()) {
				var r = fn();
				if(!r) {
					break;
				}
				else {
					result.push(r);
				}
			}
			return result;
		}

		function accessor() {
			let name = newNode(Duet.ParseNode.accessor);
			grab(Duet.Token.ident);
			while(grab(Duet.Token.period)) {
				if(!grab(Duet.Token.ident)) {
					parseError('Trailing period "." after identifier', 1, -1);
					break;
				}
			}
			return grow(name);
		}

		function declaration() {
			let name = accessor();
			if(!name) {
				return false;
			}
			let decl = newNode(Duet.ParseNode.declaration);
			decl.start = name.start;

			if(grabText(Duet.Token.operator, ':')) {
				let type = expression();
				if(!type) {
					type = parseError('Expected a type after the colon [:]', name.length, -name.length);
				}
				decl.start = name.start;
				decl.children = [name, type];
			}
			else {
				decl.children = [name];
			}
			return grow(decl);
		}

		function number(op = false) {
			let node = newNode(Duet.ParseNode.number);
			grab(Duet.Token.digits);
			if(grab(Duet.Token.period)) {
				grab(Duet.Token.digits);
			}
			grab(Duet.Token.numExp);

			return grow(node);
		}

		function value() {
			let next = peek();
			if(!next) {
				return false;
			}
			switch(next.type) {
			case Duet.Token.digits:
				return number();
			case Duet.Token.bracketStart:
				grab(next.type);
				let n = valueList(Duet.Token.bracketEnd);
				if(!grab(Duet.Token.bracketEnd)) {
					parseError('Expected a bracket "]" to end the list.', n.length, -n.length);
				}
				return n;
			case Duet.Token.ident:
				let name = accessor();
				if(grab(Duet.Token.parenStart)) {
					let node = newNode(Duet.ParseNode.funCall);
					let args = valueList(Duet.Token.parenEnd);
					if(!grab(Duet.Token.parenEnd)) {
						parseError('Expected a parenthesis ")" to end the function arguments', args.length, -args.length);
					}
					node.children = [name, args];
					return grow(node);
				}
				else {
					return name;
				}
			case Duet.Token.parenStart:
				var e = expression();
				if(!e) {
					parseError('Expected an expression inside parentheses');
				}
				if(!grab(Duet.Token.parenEnd)) {
					parseError('Expected an ending parenthesis', e.length, -e.length);
				}
				return grow(e);
			case Duet.Token.quote:
				let node = newNode(Duet.ParseNode.string);
				grab(next.type);
				while(grab(Duet.Token.stringText) || grab(Duet.Token.escapedStringText)) {
					;;
				}
				if(!grab(Duet.Token.quote)) {
					parseError("Expected a single quote ['] to end the string", 1, -1);
				}
				return grow(node);
			default:
				return false;
			}
		}

		function valueList(endType) {
			var list = newNode(Duet.ParseNode.valueList);
			while(isGood() && peek().type != endType) {
				if(list.children.length && !grab(Duet.Token.comma)) {
					list.children.push(parseError('Expected a comma in the list'));
				}
				while(grab(Duet.Token.comma)) {
					list.children.push(parseError('Extra comma', 1, -1));
				}
				skipIgnored();
				list.children.push(expression());
				skipIgnored();
			}
			return grow(list);
		}

		function expression() {
			function operator(node) {
				let c = node.children[0];
				if(c.type != Duet.ParseNode.operator) {
					console.error('Not an operator: ', tkText(tokens[c.start]), c);
					c.type = Duet.ParseNode.error;
					return null;
				}
				return c;
			}

			function isOp(node) {
				if(!node.children.length) {
					return false;
				}
				return node.children[0].type == Duet.ParseNode.operator;
			}

			function operatorText(node) {
				let op = operator(node);
				if(!op) {
					return null;
				}
				else {
					return tkText(tokens[op.start]);
				}
			}

			function precedence(node) {
				let optext = operatorText(node);
				if(!optext || !(optext in opPrecedence)) {
					return 0;
				}
				else {
					return opPrecedence[optext];
				}
			}
			function placement(top, pr_right) {
				// Parent node, right-most node
				let pl = [null, top];
				while(isOp(pl[1]) && precedence(pl[1]) >= pr_right) {
					var n = pl[1];
					pl[0] = n;
					pl[1] = n.children[n.children.length-1];
				}
				return pl;
			}
			function insert(exp, node) {
				if(exp.children.length == 3) {
					console.error('BUG: Node already has children');
				}
				else {
					exp.children.push(node);
				}
			}

			let start = tk;
			// Top-level node
			let exp = null;
			// Most recent node (the one values will be added to)
			let latest = null;

			let firstOp = grab(Duet.Token.operator);

			if(firstOp) {
				let opNode;

				let opText = tkText(firstOp);
				if(unaryOps.indexOf(opText) < 0) {
					opNode = parseError(`Invalid starting operator: [${opText}]`, 1, -1);
				}
				else {
					opNode = newNode(Duet.ParseNode.operator, 1, -1)
				}
				exp = newNode(Duet.ParseNode.expression, 1, -1);
				exp.children = [opNode];
				latest = exp;
			}
			while(isGood()) {
				if(grab(Duet.Token.operator)) {
					parseError(`Extra operator: [${tkText(next)}]`, 1, -1);
				}
				let s = tk;
				let val = value();
				if(!val) {
					let len = tk-s;
					val = parseError(`Expected a value`, len, -len);
				}
				if(!latest) {
					exp = val;
				}
				else {
					insert(latest, val);
				}
				let o = grab(Duet.Token.operator);
				if(o) {
					let otext = tkText(o);
					let opNode = newNode(Duet.ParseNode.operator, 1, -1);
					let newExp = newNode(Duet.ParseNode.expression, 1, -1);
					latest = newExp;

					let pr_right;
					if(!(otext in opPrecedence)) {
						parseError(`Unknown operator: ${otext}`, 1, -1);
						pr_right = 100;
					}
					else {
						pr_right = opPrecedence[otext];
					}

					let [parent, right] = placement(exp, pr_right);
					if(!parent) {
						newExp.children = [opNode, exp];
						newExp.start = exp.start;
						exp = grow(newExp);
					}
					else {
						let old_right = parent.children.pop();
						if(old_right != right) {
							console.error("I don't know what this means");
						}
						newExp.start = right.start;
						insert(parent, grow(newExp));
						newExp.children = [opNode, right]
					}
				}
				else {
					break;
				}
			}
			return grow(exp);
		}

		function binding() {
			let start = tk;
			let node = newNode(Duet.ParseNode.binding);
			let d = declaration();
			if(!d) {
				tk = start;
				return false;
			}
			if(!grabText(Duet.Token.operator, '=')) {
				tk = start;
				return false;
			}
			let e = expression();
			if(!e) {
				e = parseError('Expected an expression for the binding clause');
			}
			node.children = [d, e];
			if(grab(Duet.Token.semicolon)) {
				let e2 = expression();
				if(!e2) {
					e2 = parseError('Expected another expression after the initial binding (prefaced with a semicolon [;])', 1, -1);
				}
				node.children.push(e2);
			}
			while(grab(Duet.Token.semicolon)) {
				parseError('Only two expressions are allowed for each binding: an initialization, and an integration');
				let ex = expression();
				if(ex) {
					node.children.push();
				}
			}
			return grow(node);
		}

		function boolExpression() {
			return false;
		}

		function message() {
			let node = newNode(Duet.ParseNode.funCall);
			let name = accessor();
			if(!name) {
				return false;
			}
			node.children.push(name);
			if(grab(Duet.Token.parenStart)) {
				let args = valueList(Duet.Token.parenEnd);
				if(!grab(Duet.Token.parenEnd)) {
					parseError('Missing an ending parenthesis ")" after arguments', 1, -1);
				}
				node.children.push(args);
			}
			return grow(node);
		}

		function event() {
			var eventNode = newNode(Duet.ParseNode.event);
			let condition = expression();
			if(!condition) {
				return false;
			}
			eventNode.children.push(condition);
			if(!grab(Duet.Token.newline)) {
				parseError('Expected an indented line after the condition', condition.length, -condition.length);
				return grow(eventNode);
			}
			skipIgnored();
			if(!grab(Duet.Token.indentation)) {
				parseError('Expected an indented line.', condition.length, -condition.length);
				return grow(eventNode);
			}
			else {
				skipIgnored();
				let fn = message();
				if(!fn) {
					parseError('No messages for event');
				}
				else while(fn) {
					eventNode.children.push(fn);
					skipIgnored();
					if(!grab(Duet.Token.newline) || !grab(Duet.Token.indentation)) {
						break;
					}
					fn = message();
				}
			}
			return grow(eventNode);
		}

		function clause() {
			skipIgnored();
			return binding() || event();
		}

		let script = newNode(Duet.ParseNode.script);
		
		skipIgnored();
		script.children.push(header());
		script.children = script.children.concat(listOf(clause));
		skipIgnored();
		if(isGood()) {
			var l = tokens.length - tk;
			script.children.push(parseError('Remaining code was not parsed', l));
		}

		return {
			node: grow(script),
			errors: errors
		};
	},
	printableTree:(f, tree) => {
		var t = {
			type: Duet.ParseNodeNames[tree.type]
		};
		if(tree.children && tree.children.length) {
			t.children = tree.children.map((c) => Duet.printableTree(f, c));
		}
		else {
			t.text = [];
			for(let i = tree.start; i < tree.start+tree.length; i++) {
				if(!(i in f.tokens)) continue;
				let token = f.tokens[i];
				t.text.push(f.text.substr(token.start, token.length));
			}
		}
		return t;
	},
	readTree:(file)=> {
		if(!(file in Duet.files)) {
			console.error('No such file: ', file);
			return;
		}
		let f = Duet.files[file];
		return Duet.printableTree(f, f.parseTree.node);
	},
	/* Create the dependency tree and events.
	All variables are in an acyclic tree, though they can depend on the value of the previous frame.
	for example:
		position = [0,0]; position + velocity
	`position` depends on the value of `position` from the previous frame.
	Every variable has the following:
		type: Type or [Type, size] for arrays
			Based on the type of the expression or the provided hint.
		update: constant, frame, or variable
			constant: This value never updates.
			variable: the value can update, but not every frame
			frame: the value refreshes every frame, even if it's the same value
			The `update` of a variable is the max of 
		storage: global or instance
			global: there's only one copy of this value for the entire set of entities.
			instance: a unique value is saved for every instance.
				Any binding containing an initializer will be instance-storage.
				Otherwise, they're all global.
		value:
			an expression for the value of the variable, also lists dependent variables
	*/
	analyze: (filename) => {
		let file = Duet.files[filename];
		let entity = {
			type: [],
			source: filename,
			count: 0,
			toCreate: 0,
			toFree: 0,
			compute: {
				allocation: [],
				creation: [],
				frame: [],
			},
			values: {},
			events: {},
			references: [],
			freelist: []
		};
		let tree = file.parseTree.node;
		let errors = [];
		let tokens = file.tokens;
		let lowText = Duet.files[filename].text.toLowerCase();
		/* Tracking variable types
			type: Type (real, int, array, etc),
			update: Update (once, frame, message, listener),
			storage: Storage (global, instance)
			dependencies: string[]
			compute: Dictionary [string, pre-formated code]
		*/
		let variables = {};
		let events = {};

		function err(message, node) {
			errors.push({message: message, start: node.start, length: node.length});
		}
		function tkText(index) {
			let token = tokens[index];
			return lowText.substr(token.start, token.length);
		}
		function defaultCode(type, code = [], dependencies = []) {
			return {
				type: type,
				update: Update.once,
				storage: Storage.global,
				code: code,
				dependencies: dependencies
			}
		}

		const AcType = {
			varName: 0,
			funcName: 1,
			ctor: 2,
			// Platform function that must be determined at the next phase of analysis
			overload: 3
		};

		/* Return a dictionary
			type: AcType,
			local: bool,
			ref: pointer (if platform),
			text: string[]
		*/
		function resolveAccessor(accessor) {
			if(accessor.type != Duet.ParseNode.accessor) {
				err('BUG: this was supposed to be an accessor', accessor);
				return null;
			}
			if(accessor.length % 2 == 0) {
				err('Ill-formated accessor (either extra or missing periods)', accessor);
				return null;
			}
			let ac = [];
			for(let i = 0; i < accessor.length; i += 2) {
				let text = tkText(accessor.start + i);
				ac.push(text);
			}
			if(ac[ac.length - 1] == 'create') {
				if(ac.length != 2) {
					err('[create] is reserved for making objects using [name].create', accessor);
				}
				return {
					type: AcType.ctor,
					text: ac
				}
			}
			else if(ac.length == 1 && ac[0] in Duet.overloads) {
				return {
					type: AcType.overload,
					text: ac,
					ref: Duet.overloads[ac[0]],
					local: false
				}
			}
			else if(ac[0] in Duet.platform) {
				let v = Duet.platform[ac[0]];
				for(let i = 1; i < ac.length; i++) {
					if(!(ac[i] in v)) {
						err(`No such property on ${ac[i-1]}: ${ac[i]}`, {start: accessor.start+i*2, length:1});
						return defaultCode();
					}
					v = v[ac[i]];
				}
				let acType = AcType.varName;
				if(v.type == Type.function) {
					acType = AcType.funcName;
				}
				return {
					type: acType,
					text: ac,
					local: false,
					ref: v
				}
			}
			else if(ac.length > 1) {
				err(`Advanced accessors not implemented yet`, accessor);
				return defaultCode();
			}
			else {
				return {
					type: AcType.varName,
					local: true,
					text: ac
				};
			}
			return ac;
		}
		function accessorCode(acNode, ac) {
			switch(ac.type) {
			// Either a platform or local variable
			case AcType.varName: {
				// TODO: figure out nested identifiers
				if(ac.local) {
					return defaultCode(
						undefined,
						[ VM.local, ac.text[0] ],
						[ac[0]]
					);
				}

				if(!('type' in ac.ref)) {
					err(`Not a valid platform variable: ${ac.text.join('.')}`, acNode);
					return defaultCode();
				}
				let code = defaultCode(ac.ref.type);
				code.update = ac.ref.update || Update.once;
				if('get' in ac.ref) {
					code.code = [
						VM.call, ac.ref.get, 0
					];
				}
				else if('value' in ac.ref) {
					code.code = [
						VM.read, ac.ref
					];
				}
				else {
					err(`COMPILER BUG: misconfigured value ${ac.text.join('.')}`, acNode);
				}
				return code;
			}
			// A function with no arguments
			case AcType.funcName: {
				if(ac.local) {
					err('Local functions not yet implemented', acNode);
				}
				else {
					if(ac.ref.args.length) {
						err(`Function called without arguments, but it expects ${ac.ref.args.length}`, acNode);
					}
					let code = defaultCode(ac.ref.return, [VM.call, ac.ref.s, 0]);
					code.update = v.update || Update.once;
					return code;
				}
			}
			case AcType.ctor: {
				let etype = ac.text[0];
				return defaultCode(
					[Type.entity, etype],
					[
						[VM.constant, etype,],
						[VM.constant, 1,],
						[VM.constant, true,],
						[VM.call, Duet.platform.create.c, 3]
					]
				);
				break;
			}
			default:
				return defaultCode();
			}
		}
		function analyzeExp(expNode) {
			if(typeof(expNode) !== 'object' || !('type' in expNode)) {
				console.error('Not a valid expression:', expNode);
				return defaultCode();
			}
			switch(expNode.type) {
			case Duet.ParseNode.accessor: {
				// Special case of creating nodes
				let c = resolveAccessor(expNode);
				return accessorCode(expNode, c);
			}
			case Duet.ParseNode.number: {
				let workingText = '';
				for(let i = 0; i < expNode.length; i++) {
					workingText += tkText(expNode.start+i);
				}
				let n = Number(workingText);
				return defaultCode(Type.real, [VM.constant, n]);
			}
			case Duet.ParseNode.string: {
				let workingText = '';
				for(let i = 1; i < expNode.length - 1; i++) {
					let tok = tokens[expNode.start+i];
					if(tok.type == Duet.Token.stringText) {
						workingText += tok.type;
					}
					else if(tok.type == Duet.Token.escapedStringText) {
						switch(tkText(expNode.start+i)) {
						case '\\n':
							workingText += '\n';
							break;
						case '\\t':
							workingText += '\t';
							break;
						}
					}
				}
				return defaultCode(Type.string, [VM.constant, workingText]);
			}
			case Duet.ParseNode.funCall:{
				let name = resolveAccessor(expNode.children[0]);
				if(name.type != AcType.funcName && name.type != AcType.overload) {
					err('Tried to call a variable like a function', expNode.children[0]);
					return defaultCode();
				}
				if(name.local || !name.ref) {
					err(`Local functions not implemented yet: ${name.text.join('.')}`, expNode);
					return defaultCode();
				}
				let ref = name.ref;
				let args = expNode.children[1];
				if(args.type != Duet.ParseNode.valueList) {
					err(`Expected a list of arguments for the function ${name.text.join('.')}`, expNode);
					return defaultCode();
				}
				let code = [];
				let update = Update.once;
				let storage = Storage.global;
				let expLength = name.type == AcType.funcName? ref.args.length : ref.argCount;
				if(args.children.length != expLength) {
					err(`Function ${name.text.join('.')} expects ${expLength} arguments, but was given ${args.children.length} instead.`, args);
				}
				for(let i = 0; i < args.children.length; i++) {
					let a = args.children[i];
					let argCode = analyzeExp(a);
					if(name.type == AcType.funcName) {
						let expType = name.ref.args[i];
						if(argCode.type && expType != argCode.type) {
							err(`Function ${name.text.join('.')} expected an argument of type ${TypeNames[expType]}, but received ${TypeNames[argCode.type]}`, a); 
						}
					}
					code.push(argCode.code);
					update = Math.max(argCode.update, update);
					storage = Math.max(argCode.storage, storage);
				}
				if(ref.async) {
					code.push([VM.callAsync, ref, args.children.length]);
				}
				else {
					code.push([VM.call, ref, args.children.length]);
				}

				return {
					type: ref.return,
					update: ref.update || Update.once,
					code: code
				}
			}
			case Duet.ParseNode.valueList: {
				let elemType = -1;
				let code = [];
				let update = Update.once;
				let storage = Storage.global;
				for(let a of expNode.children) {
					let argCode = analyzeExp(a);
					if(elemType >= 0 && argCode.type != elemType) {
						err(`Assumed list was of type ${TypeNames[elemType]}, but this value is of type ${TypeNames[a.type]}`, a);
					}
					elemType = argCode.type;
					code.push(argCode.code);
					update = Math.max(argCode.update, update);
					storage = Math.max(argCode.storage, storage);
				}
				code.push([VM.array, expNode.children.length]);
				return {
					type: [elemType],
					update: update,
					storage: storage,
					code:code
				};
			}
			case Duet.ParseNode.expression: {
				let op = expNode.children[0];
				if(op.type != Duet.ParseNode.operator) {
					err('COMPILER BUG: expected an operator', op);
				}
				if(expNode.children.length < 2 || expNode.children.length > 3) {
					err('COMPILER BUG: operators only work with 1 or 2 values.', expNode);
				}
				let code = [];
				let type = undefined;
				let update = Update.once;
				let storage = Storage.global;
				// TODO: properly figure out what we can
				for(let i = 1; i < expNode.children.length; i++) {
					let a = expNode.children[i];
					let argCode = analyzeExp(a);
					type = type || argCode.type;
					code.push(argCode.code);
					update = Math.max(argCode.update, update);
					storage = Math.max(argCode.storage, storage);
				}
				code.push([VM.call, tkText(op.start), expNode.children.length - 1]);
				return  {
					type: type,
					update: update,
					storage: storage,
					code:code
				};
			}
			default:
				console.error('Not supported:', Duet.printableTree(file, expNode));
				return defaultCode();
			}
		}

		let header = tree.children[0];
		if(header.type != Duet.ParseNode.header) {
			err('Expected the program to start with a header, got ${Duet.ParseNodeNames}', header);
		}
		let type = tkText(header.start);
		let name = tkText(header.start + 1);
		if(!(type in Type) || (type != 'program' && type != 'entity')) {
			err(`Expected the script type to be [program] or [entity], found ${type}`, {start: header.start, length: 1});
		}
		if(name in Duet.entities) {
			err(`Entity class ${name} already exists`, header.start+1, 1);
		}
		entity.type = [Type[type], name];
		for(let i = 1; i < tree.children.length; i++) {
			let node = tree.children[i];
			if(node.type == Duet.ParseNode.binding) {
				let declaration = node.children[0];
				let ident = declaration.children[0];
				if(ident.type != Duet.ParseNode.accessor || ident.children.length || ident.length > 1) {
					err('Advanced bindings not implemented yet', node);
					continue;
				}
				let name = tkText(ident.start);
				if(name in variables) {
					err(`Duplicate variable declaration: ${name}`, ident); 
				}
				let value1 = analyzeExp(node.children[1]);
				// An initialization and an integration
				if(node.children.length == 2) {
					variables[name] = value1;
				}
				else if(node.children.length == 3) {
					variables[name] = value1;
					variables[name].storage = Storage.instance;
					variables[name].integrate = analyzeExp(node.children[2]);
				}
				else{
					err('COMPILER BUG: expected one or two values in binding', node);
				}
				entity.values[name] = null;
			}
			else if(node.type == Duet.ParseNode.event) {
				let cond = node.children[0];
				if(cond.type != Duet.ParseNode.accessor || cond.children.length > 1) {
					err(`Advanced conditions not implemented yet`, cond);
				}
				let name = tkText(cond.start);
				if(!name in events) {
					events[name] = [];
				}
			}
			else {
				err(`Unexpected statement type: ${Duet.ParseNodeNames[node.type]}`, node);
			} 
		}
		function printableVar(val) {
			let rcode;
			function readableCode(line) {
				if(Array.isArray(line[0])) {
					return line.map(readableCode);
				}
				return [VMNames[line[0]]].concat(line.slice(1));
			}
			let readableType = undefined;
			if(Array.isArray(val.type)) {
				readableType = [TypeNames[val.type[0]]].concat(val.type.slice(1));
			}
			else if(val.type in TypeNames) {
				readableType = TypeNames[val.type];
			}

			let r = {
				type: readableType,
				update: UpdateNames[val.update],
				storage: StorageNames[val.storage],
				code: readableCode(val.code),
			};
			if('integrate' in val) {
				r.integrate = printableVar(val.integrate);
			}
			return r;
		}
		for(let val in variables) {
			console.log(val, '=', printableVar(variables[val]));
		}
		return {entity:entity, errors:errors};
	}
};

for(let k in Duet.Token) {
	Duet.TokenNames[Duet.Token[k]] = k;
}
for(let k in Duet.ParseNode) {
	Duet.ParseNodeNames[Duet.ParseNode[k]] = k;
}
for(let k in Type) {
	TypeNames[Type[k]] = k;
}
for(let k in Update) {
	UpdateNames[Update[k]] = k;
}
for(let k in Storage) {
	StorageNames[Storage[k]] = k;
}
for(let k in VM) {
	VMNames[VM[k]] = k;
}