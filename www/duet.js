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
	struct: 2,
	functionType: 3,
	type: 4,
	boolean: 5,
	string: 6,
	object: 7,
	entity: 8,
	program: 9,
};

const Update = {
	constant: 0,
	variable: 1,
	frame: 2,
};

const VM = {
	constant: 0,
	local: 1, 
	call: 2,
	callAsync: 3,
	array: 4,
	read: 5,
};

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

function binGen(op) {
	return {
		ss: op,
		sv: opSV(op),
		vv: opVV(op),
		vs: opVS(op)
	}
}

function unGen(op) {
	let r = {
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
	// Our "standard library"
	platform: {
		image: {type: Type.type},
		ops: {
			add:binGen(opCore.add),
			sub:binGen(opCore.sub),
			mul:binGen(opCore.mul),
			div:binGen(opCore.div),
			clamp: {
				sss: opCore.clamp,
				vss: opVSS(opCore.clamp),
				vvv: opVVV(opCore.clamp)
			}
		},
		opv: {
			addv:binGen(opVV(opCore.add)),
			subv:binGen(opVV(opCore.sub)),
			mulv:binGen(opVV(opCore.mul)),
			divv:binGen(opVV(opCore.div)),

			adds:binGen(opVS(opCore.add)),
			subs:binGen(opVS(opCore.sub)),
			muls:binGen(opVS(opCore.mul)),
			divs:binGen(opVS(opCore.div)),

			addsv:binGen(opSV(opCore.add)),
			subsv:binGen(opSV(opCore.sub)),
			mulsv:binGen(opSV(opCore.mul)),
			divsv:binGen(opSV(opCore.div)),

			clamp: {
				sss: opVVV(opCore.clamp),
				vss: opVSS(opVVV(opCore.clamp)),
				vvv: opVVV(opVVV(opCore.clamp))
			}
		},
		canvas: {
			type: Type.struct,
			update: Update.variable,
			clearcolor: {
				type: [Type.real, 3],
				value: [1,1,1]
			},
			size: {
				type: [Type.real, 2],
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
		frame: {
			type: Type.integer,
			update: Update.frame,
			value: 0
		},
		deltams: {
			type: Type.integer,
			update: Update.constant,
			value: 16
		},
		file: {
			Type: Type.struct,
			loadsprite: {
				type: Type.function,
				update: Update.constant,
				arguments: [Type.string],
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
			type: Type.struct,
			update: Update.frame,
			right: {
				type: Type.integer,
				value: 0
			},
			left: {
				type: Type.integer,
				value: 0
			},
			up: {
				type: Type.integer,
				value: 0
			},
			down: {
				type: Type.integer,
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

		setTimeout(Duet.frame, Duet.platform.deltams.value);
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
		Duet.platform.frame.value += 1;
		if(!Duet.getPaused()) {
			setTimeout(Duet.frame, Duet.platform.deltams.value);
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
			let d = testAnalysis[f];
			// let d = Duet.analyze(Duet.files[f]);
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
		for(let err of result.errors) {
			console.error('Parsing error: ', err.message, 'at token: ', err.start);
			for(let i = err.start; i < err.start+err.length; i++) {
				if(!(i in tokens)) continue;
				tokens[i].span.classList.add('code-error');
			}
		}
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
			condition.type = Duet.ParseNode.condition;
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
	readTree:(file)=> {
		if(!(file in Duet.files)) {
			console.error('No such file: ', file);
			return;
		}
		let f = Duet.files[file];
		function treeRecurse(tree) {
			var t = {
				type: Duet.ParseNodeNames[tree.type]
			};
			if(tree.children && tree.children.length) {
				t.children = tree.children.map(treeRecurse);
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
		}
		return treeRecurse(f.parseTree.node);
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
	analyze: (file) => {
		let tree = file.parseTree.node;
		// An array of the top-level variables and their dependencies
		let variables = [];
		let events = [];
		return {
			dependencies: variables,
			events: events
		}
	}
};

for(let k in Duet.Token) {
	Duet.TokenNames[Duet.Token[k]] = k;
}
for(let k in Duet.ParseNode) {
	Duet.ParseNodeNames[Duet.ParseNode[k]] = k;
}