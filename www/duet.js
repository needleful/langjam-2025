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
	unknown: 8,
	void: 9
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
	static: 0,
	instance: 1,
};

let StorageNames = {};

const VM = {
	constant: 0,
	localInstance: 1,
	call: 2,
	callAsync: 3,
	array: 4,
	read: 5,
	nonlocal: 6,
	localStatic: 7, 
};

let VMNames = {};

const VMLength = {
	[[VM.constant]]: 2,
	[[VM.localInstance]]: 2,
	[[VM.localStatic]]: 2,
	[[VM.nonlocal]]: 2,
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
	},
	less: (a, b) => {
		return 1.0*(a < b)
	},
	greater: (a, b) => {
		return 1.0*(a > b)
	},
	lessOrEqual: (a, b) => {
		return 1.0*(a <= b)
	},
	greaterOrEqual: (a, b) => {
		return 1.0*(a >= b)
	}
}

function opVV(op) {
	return function(as, bs) {
		let r = [];
		r.length = as.length;
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
		if(!Array.isArray(as)) {
			Duet.logError('Expected an array here');
		}
		let r = [];
		r.length = as.length;
		for(let i = 0; i < as.length; i++) {
			r[i] = op(as[i], b);
		}
		return r;
	};
}

function binGen(type1, op, type2 = Type.unknown, retType = Type.unknown) {
	if(type2 === Type.unknown) {
		type2 = type1
	}
	if(retType === Type.unknown) {
		retType = type1
	}
	return {
		type: Type.function,
		return: retType,
		args: [type1, type2],
		ss: op,
		sv: opSV(op),
		vv: opVV(op),
		vs: opVS(op)
	}
}

function unGen(type, op, retType = Type.unknown) {
	if(retType == Type.unknown) {
		retType = type;
	}
	return {
		type: Type.function,
		return: retType,
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
			argCount: 3
		},
		floor: {
			overload: 'floor',
			baseType: Type.real,
			argCount: 1,
		},
		ceil: {
			overload: 'ceil',
			baseType: Type.real,
			argCount: 1,
		},
		tostring: {
			overload: 'tostring',
			baseType: Type.real,
			argCount: 1
		}
	},
	OpNames: {
		'+': 'add',
		'-': 'subtract',
		'*': 'multiply',
		'/': 'divide',
		'%': 'modulo',
		'<': 'less',
		'>': 'greater',
		'<=': 'lessOrEqual',
		'>=': 'greaterOrEqual',
	},
	// Our "standard library"
	platform: {
		image: {type: Type.type},
		pi: {
			type: Type.real,
			update: Update.once,
			get:() => Math.PI
		},
		ops: {
			sign: unGen(Type.real, Math.sign),
			arctan:unGen(Type.real, Math.atan),
			toS: {
				add:binGen(Type.real, opCore.add),
				subtract:binGen(Type.real, opCore.sub),
				multiply:binGen(Type.real, opCore.mul),
				divide:binGen(Type.real, opCore.div),

				less:binGen(Type.real, opCore.less),
				greater:binGen(Type.real, opCore.greater),
				lessOrEqual:binGen(Type.real, opCore.lessOrEqual),
				greaterOrEqual:binGen(Type.real, opCore.greaterOrEqual),
			},
			toV: {
				add:binGen(Type.real, opSV(opCore.add), [Type.real], [Type.real]),
				subtract:binGen(Type.real, opSV(opCore.sub), [Type.real], [Type.real]),
				multiply:binGen(Type.real, opSV(opCore.mul), [Type.real], [Type.real]),
				divide:binGen(Type.real, opSV(opCore.div), [Type.real], [Type.real]),

				less:binGen(Type.real, opSV(opCore.less), [Type.real], [Type.real]),
				greater:binGen(Type.real, opSV(opCore.greater), [Type.real], [Type.real]),
				lessOrEqual:binGen(Type.real, opSV(opCore.lessOrEqual), [Type.real], [Type.real]),
				greaterOrEqual:binGen(Type.real, opSV(opCore.greaterOrEqual), [Type.real], [Type.real]),
			},
			clamp: {
				type: Type.function,
				return: Type.real,
				args: [Type.real, Type.real, Type.real],
				sss: opCore.clamp,
				vss: opVSS(opCore.clamp),
				vvv: opVVV(opCore.clamp)
			},

			floor: unGen(Type.real, Math.floor),
			ceil: unGen(Type.real, Math.ceil),
			tostring: unGen(Type.real, String, Type.string)
		},
		opv: {
			arctan2:unGen([Type.real, 2], (p) => Math.atan(p[1]/p[0]), Type.real),
			angle2:unGen([Type.real, 2],
				(p) => Math.atan(p[1]/p[0]) + Math.PI*(p[0] < 0),
				Type.real
			),
			toV: {
				add:binGen([Type.real], opVV(opCore.add)),
				subtract:binGen([Type.real], opVV(opCore.sub)),
				multiply:binGen([Type.real], opVV(opCore.mul)),
				divide:binGen([Type.real], opVV(opCore.div)),

				less:binGen([Type.real], opVV(opCore.less)),
				greater:binGen([Type.real], opVV(opCore.greater)),
				lessOrEqual:binGen([Type.real], opVV(opCore.lessOrEqual)),
				greaterOrEqual:binGen([Type.real], opVV(opCore.greaterOrEqual)),
			},
			toS: {
				add:binGen([Type.real], opVS(opCore.add), Type.real),
				subtract:binGen([Type.real], opVS(opCore.sub), Type.real),
				multiply:binGen([Type.real], opVS(opCore.mul), Type.real),
				divide:binGen([Type.real], opVS(opCore.div), Type.real),

				less:binGen([Type.real], opVS(opCore.less), Type.real),
				greater:binGen([Type.real], opVS(opCore.greater), Type.real),
				lessOrEqual:binGen([Type.real], opVS(opCore.lessOrEqual), Type.real),
				greaterOrEqual:binGen([Type.real], opVS(opCore.greaterOrEqual), Type.real),
			},
			clamp: {
				type: Type.function,
				return: [Type.real],
				args: [[Type.real],[Type.real],[Type.real]],
				sss: opVVV(opCore.clamp),
				vss: opVSS(opVVV(opCore.clamp)),
				vvv: opVVV(opVVV(opCore.clamp))
			},

			floor: unGen([Type.real], (list) => list.map(Math.floor)),
			ceil: unGen([Type.real], (list) => list.map(Math.ceil)),
			index: binGen([Type.real], (a, b) => a[b], Type.real, Type.real),
			magnitude:unGen([Type.real], (v) => {
				let r = 0;
				for(let val of v) {
					r += val*val;
				}
				return Math.sqrt(r);
			}, Type.real),
			normalize: unGen([Type.real], (v) => {
				let r = [];
				r.length = v.length;
				let m = Duet.platform.opv.magnitude.s(v);
				for(let i = 0; i < v.length; i++) {
					r[i] = m? v[i]/m : 0.0;
				}
				return r;
			}),
			tostring: unGen([Type.real], String, Type.string)
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
			drawtext: {
				type: Type.function,
				args: [Type.string, [Type.real, 2], Type.real],
				requiredArgs: 2,
				return: Type.void,
				vv: (text, positions, angles = [0]) => {
					for(let i = 0; i < positions.length; i++) {
						let pos = positions[i];
						let angle = angles[i % angles.length];
						Duet.draw2d.setTransform(1, 0, 0, 1, pos[0], pos[1]);
						Duet.draw2d.rotate(angle);
						Duet.draw2d.fillText(text[i],0,0);
					}
				},
				sv: (text, positions, angles = [0]) => {
					for(let i = 0; i < positions.length; i++) {
						let pos = positions[i];
						let angle = angles[i % angles.length];
						Duet.draw2d.setTransform(1, 0, 0, 1, pos[0], pos[1]);
						Duet.draw2d.rotate(angle);
						Duet.draw2d.fillText(text,0,0);
					}
				},
				ss: (text, pos, angle = 0) => {
					Duet.draw2d.setTransform(1, 0, 0, 1, pos[0], pos[1]);
					Duet.draw2d.rotate(angle);
					Duet.draw2d.fillText(text,0,0);
				},
				svv:(t,p,a) => Duet.platform.canvas.drawtext.vv(t,p,a),
				svv:(t,p,a) => Duet.platform.canvas.drawtext.sv(t,p,a),
				sss:(t,p,a) => Duet.platform.canvas.drawtext.ss(t,p,a),
			},
			drawsprite: {
				type: Type.function,
				args: ['image', [Type.real, 2], Type.real],
				requiredArgs: 2,
				return: Type.void,
				sv: (image, positions, angles = [0]) => {
					//console.log('Drawing:', image, pos, [image.width, image.height]);
					let cw = image.width/2;
					let ch = image.height/2;

					for(let i = 0; i < positions.length; i++) {
						let pos = positions[i];
						let angle = angles[i % angles.length];
						Duet.draw2d.setTransform(1, 0, 0, 1, pos[0], pos[1]);
						Duet.draw2d.rotate(angle);
						Duet.draw2d.drawImage(image, -cw, -ch);
					}
				},
				ss: (image, pos, angle = 0) => {
					let cw = image.width/2;
					let ch = image.height/2;
					Duet.draw2d.setTransform(1, 0, 0, 1, pos[0] - cw, pos[1] - ch);
					Duet.draw2d.rotate(angle);
					Duet.draw2d.drawImage(image, -cw, -ch);
				},
				sss: (i, p, a) =>
					Duet.platform.canvas.drawsprite.ss(i, ps, a),
				ssv: (i, p, as) =>
					as.map(a => Duet.platform.canvas.drawsprite.sss(i, p, a)),
				svs: (i, ps, a) =>
					Duet.platform.canvas.drawsprite.sv(i, ps, [a]),
				svv: (i, ps, as) =>
					Duet.platform.canvas.drawsprite.sv(i, ps, as)
			},
		},
		paused: {
			type: Type.boolean,
			update: Update.variable,
			value: false
		},
		time: {
			frame: {
				type: Type.real,
				update: Update.frame,
				value: 0
			},
			deltams: {
				type: Type.real,
				update: Update.once,
				value: 16
			},
		},
		file: {
			sprites: {},
			loadsprite: {
				type: Type.function,
				async: true,
				update: Update.once,
				args: [Type.string],
				return: 'image',
				s: (path) => {
					if(path in Duet.platform.file.sprites) {
						return Duet.platform.file.sprites[path];
					} 
					let result = new Promise((resolve, reject) => {
						const img = new Image();
						img.crossOrigin = 'anonymous';
						img.onload = () => {
							console.log('Image Loaded:', path);
							document.getElementById('loaded-images').appendChild(img);
							Duet.platform.file.sprites[path] = img;
							img.alt = `Loaded sprite: ${path}`;
							img.title = `Loaded sprite: ${path}`;
							resolve(img);
						}
						img.onerror = () => {
							Duet.logError('Failed to load image: ', path);
							delete Duet.platform.file.sprites[path];
							reject();
						}
						img.src = path;
					});
					Duet.platform.file.sprites[path] = result;
					return result;
				}
			},
		},
		input: {
			pause: {
				type: Type.real,
				update: Update.frame,
				value: 0
			},
			right: {
				type: Type.real,
				update: Update.frame,
				value: 0
			},
			left: {
				type: Type.real,
				update: Update.frame,
				value: 0
			},
			up: {
				type: Type.real,
				update: Update.frame,
				value: 0
			},
			down: {
				type: Type.real,
				update: Update.frame,
				value: 0
			},
			mouse: {
				type: [Type.real, 2],
				update: Update.frame,
				value: [0,0]
			},
			click: {
				left: {type: Type.real, update: Update.frame, value: 0},
				right: {type: Type.real, update: Update.frame, value: 0}
			}
		}
	},
	create: (typename, count = 1, refer = false, init = false) => {
		console.log(`Creating ${count} instances of: ${typename}`);
		if(!(typename in Duet.entities)) {
			Duet.logError('No such entity type: ' + typename);
			return -1;
		}
		let et = Duet.entities[typename];
		let startId = et.count + et.toCreate.plain - et.toFree;
		et.toCreate.plain += count;
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
	},

	// Set once per script
	entities: {},
	messages: [],
	press: (e) => {
		Duet._keySet(e.key, 1);
	},
	checkMouse: (event) => {
		let m = Duet.platform.input.click;
		if(event.buttons === undefined) {
			console.warn('I can\'t be bothered');
		}
		else {
			m.left.value = event.buttons & 1;
			m.right.value = event.buttons & 2 >> 1;
		}
	},
	mousemove: (event) => {
		let r = Duet.canvas.getBoundingClientRect();
		Duet.platform.input.mouse.value = [event.clientX - r.x, event.clientY - r.y];
		Duet.checkMouse(event);
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
		case "Escape":
			if(val) Duet.setPaused(!Duet.getPaused());
			Duet.platform.input.pause.value = val;
			break;
		}
	},
	release: (e) => {
		Duet._keySet(e.key, 0);
	},

	instr: (typename, stack, code, pointer, indexed) => {
		let instr = code[pointer];
		if(!(instr in VMLength)) {
			Duet.logError('Not an implemented instruction:', VMNames[instr], instr, code, pointer);
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
		case VM.localStatic: {
			stack.push(Duet.entities[typename].values[arg(1)]);
			break;
		} 
		case VM.localInstance: {
			let val = Duet.entities[typename].values[arg(1)];
			// We're indexing a subset of values
			if(indexed) {
				let newval = [];
				newval.length = indexed.length;
				for(let i = 0; i < indexed.length; i++) {
					newval[i] = val[indexed[i]];
				}
				val = newval;
			}
			stack.push(val);
			break;
		}
		case VM.nonlocal:{
			let keys = arg(1);
			let value = undefined;
			for(let i = 0; i < keys.length - 1; i += 2) {
				let ent = keys[i];
				let varname = keys[i+1];
				let v = Duet.entities[ent].values[varname];
				if(value !== undefined) {
					value = v[value];
				}
				else {
					value = v;
				}
			}
			stack.push(value);
			break;
		}
		// A refernce to a platform variable
		case VM.read: {
			stack.push(arg(1).value);
			break;
		}
		case VM.callAsync:
		case VM.call: {
			let fn = arg(1);
			if(typeof(fn) !== 'function') {
				Duet.logError('Expected a function: ', fn, code, pointer);
				return false;
			}
			let len = arg(2);
			let args = stack.slice(stack.length - len);
			stack.length -= len;

			let result = fn(...args);
			if(instr == VM.callAsync && 'then' in result) {
				let id = Duet.promises.waiting.length;
				Duet.promises.waiting.push(result.then((value) => {
					Duet.promises.results[id] = value;
				}));
				stack.push({_promise: id});
			}
			else {
				stack.push(result);
			}
			break;
		}
		case VM.array: {
			let len = arg(1);
			let result = stack.slice(stack.length - len);
			stack.length -= len;
			stack.push(result);
			break;
		}
		default:
			Duet.logError(`Not an implemented instruction: ${VMNames[instr]}(code ${instr})`);
			return false;
		}
		return true;
	},

	eval: (typename, code, indexed = false) => {
		if(typeof(typename) != 'string') {
			Duet.logError('Typename expected');
		}
		let stack = [];
		for(
			let pointer = 0;
			pointer < code.length;
			pointer += VMLength[code[pointer]]
		) {
			try{
				if(!Duet.instr(typename, stack, code, pointer, indexed))
				{
					break;
				}
			}
			catch(err) {
				let c = Duet.readableCode(code);
				let str = '';
				for(let i = 0; i < c.length; i++) {
					str += `\n${String(i).padStart(' ', 5)} | ${c[i]}`;
					if(i == pointer) {
						str += '\n        ^^^^^^^^^^^^^^^^^^^^^^';
					}
				}
				Duet.logError(`Error at instruction: ${pointer}\n`, err, str, '\n\nStack:\n| ', JSON.stringify(stack));
				throw err;
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
			Duet.logError('No such entity type: ', typename);
		}
		let e = Duet.entities[typename];
		for(let alloc of e.compute.allocation) {
			let varname = alloc[0];
			try{
				e.values[varname] = Duet.eval(typename, alloc[1]);
			}
			catch(err) {
				Duet.logError(`Error allocating ${typename}.${varname}:`, err);
				Duet.setPaused(true);
			}
		}
	},

	run: () => {
		Duet.draw2d = Duet.canvas.getContext('2d');
		Duet.draw2d.fillStyle = 'white';
		// Default events
		Duet.canvas.onkeydown = Duet.press;
		Duet.canvas.onkeyup = Duet.release;
		Duet.canvas.onclick = Duet.click;

		// Creation of the program and loading entity types
		for(let type in Duet.entities) {
			Duet.allocate(type)
		}
		Duet.create(Duet.program, 1);

		setTimeout(Duet.frame, Duet.platform.time.deltams.value);
	},
	frame: async () => {
		// Begin the frame
		if(Duet.promises.waiting.length) {
			await Promise.all(Duet.promises.waiting);
		}
		let messages = [];
		{
			Duet.draw2d.setTransform(1,0,0,1,0,0);
			Duet.draw2d.clearRect(0,0, Duet.canvas.width,Duet.canvas.height)
			//Duet.draw2D
		}

		for(let typename in Duet.entities) {
			// Entity creation
			let type = Duet.entities[typename];

			if(Duet.promises.waiting.length) {
				for(let v in type.values) {
					if(!type.values[v]) continue;
					if(typeof(type.values[v]) === 'object' && '_promise' in type.values[v]) {
						let id = type.values[v]._promise;
						type.values[v] = Duet.promises.results[id];
						console.log(`Promise fulfilled: ${typename}.${v} = ${type.values[v]}`);
					}
				}
			}

			type.count -= type.toFree;
			if(type.toCreate.plain) {
				for(let val of type.compute.creation) {
					let valname = val[0];
					let start = type.count;
					type.values[valname].length += type.toCreate.plain;
					try {
						let init = Duet.eval(typename, val[1]);
						for(let i = start; i < start + type.toCreate.plain; i++) {
							let val = init;
							if(Array.isArray(init)) {
								val = [...init];
							}
							type.values[valname][i] = val;
						}
					}
					catch(err) {
						Duet.logError(`Error creating ${typename}.${varname}:`, err);
						Duet.setPaused(true);
					}
				}
				type.count += type.toCreate.plain;
			}
			type.toFree = 0;
			type.toCreate.plain = 0;

			// Running in the frame
			if(!type.count) {
				continue;
			}
			for(let val of type.compute.frame) {
				let valname = val[0];
				let newval;
				try {
					newval = Duet.eval(typename, val[1]);
				}
				catch(err) {
					Duet.logError(`Could not update ${typename}.${valname}`);
					Duet.setPaused(true);
				}

				let addMessage = true;
				let indexed = false;
				if(valname in type.events) {
					let event = type.events[valname];
					// Check if global value changed
					if(event.storage == Storage.static) {
						let oldVal = type.values[valname];
						if(oldVal == newval) {
							addMessage = false;
						}
					}
					// Check each instance for changes
					else {
						indexed = [];
						let oldVal = type.values[valname];
						for(let i = 0; i < oldVal.length; i++) {
							if(oldVal[i] != newval[i]) {
								indexed.push(i);
							}
						}
						if(!indexed.length) {
							addMessage = false;
						}
					}
					if('conditional' in event) {
						try {
							let val = Duet.eval(typename, event.condition);
							if(!val) {
								addMessage = false;
							}
						}
						catch(err) {
							Duet.logError(`Error on conditional listener for ${typename}${valname}:`, err);
							Duet.setPaused(true);
						}
					}
					if(addMessage) {
						messages.push([typename, event.do, indexed]);
					}
				}
				type.values[valname] = newval;
			}
		}
		for(let message of messages) {
			try{
				Duet.eval(...message);
			}
			catch(err) {
				Duet.logError(`Error processing message for ${message[0]}:`, err);
				Duet.setPaused(true);
			}
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
		if(p == Duet.platform.paused.value) {
			return;
		}
		Duet.platform.paused.value = p;
		if(!p) {
			Duet.frame();
		}
		let b = document.getElementById('button-pause');
		b.innerText = Duet.getPaused() ? 'Resume' : 'Pause';
	},
	getPaused: () => {
		return Duet.platform.paused.value;
	},
	switchTo: (name) => {
		Duet.updateText();
		if(name in Duet.files) {
			Duet.activeFile = name;
			var file = Duet.files[name];
			file.path = name;
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
			Duet.logError('DUET: could not switch to file: ', name);
		}
	},
	loadObject: async (path) => {
		const response = await fetch(path);
		if(!response.ok) {
			Duet.logError('DUET: could not load file: ', path);
			return;
		}
		console.log('DUET: loading ', path);
		let id = path;
		Duet.addObject(id, {
			type:"Beats Me",
			path: path,
			text: (await response.text()).replaceAll('\r\n', '\n').replaceAll('\r', '\n'),
		}, false);
	},
	addObject: (id, info, p_switch = true) => {
		if(id in Duet.files) {
			Duet.logError('Duplicate file name: ', id);
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
		Duet.files[id].path = id;
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
	compileAndRun: () => {
		document.getElementById('errors-list').textContent = '';
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
					Duet.logError("Assertion context:", data);
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
			c = token.start + token.length;
			let txt = text.substr(token.start, token.length);
			if(txt.endsWith('\n') && c == text.length) {
				txt += ' ';
			}
			token.span = span(view,
				txt,
				'code-'+Duet.TokenNames[token.type]);
			
		}
		// Trailing whitespace
		if(c < text.length) {
			span(view, text.substr(c - text.length));
		}
		sync_scroll();
	},
	logError:(text, ...info) => {
		let list = document.getElementById('errors-list');
		let li = makeChild(list, 'li');
		let code = makeChild(li, 'code');
		code.innerText = text + info.join(' ');
		console.error(text, ...info);
	},
	logParseErrors:(file, errors) => {
		for(let err of errors) {
			let problemText;
			if(err.start in file.tokens) {
				let start = file.tokens[err.start].start;
				let endTk = file.tokens[err.start + err.length - 1];
				if(!endTk) {
					endTk = start;
				}
				let end = endTk.start + endTk.length;
				problemText = `Text: "${file.text.substr(start, end-start)}"`.replaceAll('\t', '⇥').replaceAll('\n', '↳');
			}
			else {
				problemText = `From tokens ${err.start} to ${err.start + err.length}`;
			}
			let errText = `${file.path}: ${err.message}\n\t${problemText}`;
			Duet.logError(errText);

			for(let i = err.start; i < err.start+err.length; i++) {
				if(!(i in file.tokens)) continue;
				if(!file.tokens[i].span) continue;
				file.tokens[i].span.title = err.message;
				file.tokens[i].span.classList.add('code-error');
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
		Duet.logParseErrors(f, result.errors);
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
		invalid: 17,
		equal: 18
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
		const r_comment = /^\#.*[\n\r]/;
		const r_newline = /^(\s*[\n\r])+/;
		const r_indent = /^\t+/;
		// For now, just single-character escapes
		const r_escaped = /^\\./;
		// catch-all for operator-like characters
		const r_operator = /^[^\s\d\p{Alpha}_[\]{}()'#]+/u;
		const r_text = /^[^\'\\]+/;
		const r_equal = /^=[^<>]/;

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
			|| grabRegex(Duet.Token.equal, r_equal)
			|| grabRegex(Duet.Token.comment, r_comment)
			|| grabRegex(Duet.Token.operator, r_operator)
			){
				continue;
			}
			else {
				addToken(Duet.Token.invalid, 1);
				Duet.logError('Invalid token: ', text.substr(c, 5));
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
		index: 18,
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
			'!':6, '&':7, '|':8,
			':':9
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

		function skipIgnored(skipTabs = false) {
			while(grab(Duet.Token.comment) || grab(Duet.Token.newline) || (skipTabs && grab(Duet.Token.indentation))) {
				;;
			}
		}

		function header() {
			let h = newNode(Duet.ParseNode.header);
			if(!h) {
				return parseError(`Script should start with a header type ('program' or 'script'). Found [${Duet.TokenNames[peek()]}]`);
			}
			let type = grab(Duet.Token.ident);
			if(!type) {
				return parseError(`The script should start with a type and name. Found '${Duet.TokenNames[peek().type]}'`);
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
				let type = valueList(Duet.Token.equal);
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
				else if(grab(Duet.Token.bracketStart)) {
					let node = newNode(Duet.ParseNode.index);
					let args = valueList(Duet.Token.bracketEnd);
					if(!grab(Duet.Token.bracketEnd)) {
						parseError('Expected a bracket "]" to end the array indexing', args.length, -args.length);
					}
					node.children = [name].concat(args.children);
					return grow(node);
				}
				else {
					return name;
				}
			case Duet.Token.parenStart:
				grab(Duet.Token.parenStart);
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
				skipIgnored(true);
				list.children.push(expression());
				skipIgnored(true);
			}
			return grow(list);
		}

		function expression() {
			function operator(node) {
				let c = node.children[0];
				if(c.type != Duet.ParseNode.operator) {
					Duet.logError('Not an operator: ', tkText(tokens[c.start]), c);
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
					Duet.logError('BUG: Node already has children');
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
				if(!unaryOps.includes(opText)) {
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
							Duet.logError("I don't know what this means");
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

			return exp && grow(exp);
		}

		function binding() {
			let start = tk;
			let node = newNode(Duet.ParseNode.binding);
			let d = declaration();
			if(!d) {
				tk = start;
				return false;
			}
			if(!grab(Duet.Token.equal)) {
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
			if(!condition || condition.length == 0) {
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
					if(!grab(Duet.Token.newline)) {
						break;
					}
					skipIgnored();
					if(!grab(Duet.Token.indentation)) {
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
			Duet.logError('No such file: ', file);
			return;
		}
		let f = Duet.files[file];
		return Duet.printableTree(f, f.parseTree.node);
	},
	readableType: (type) => {
		if(typeof(type) === 'string') {
			return 'platform:'+type;
		}
		let rt = 'unknown';
		if(Array.isArray(type)) {
			rt = `array(${[TypeNames[type[0]]].concat(type.slice(1))})`;
		}
		else if(type in TypeNames) {
			rt = TypeNames[type];
		}
		return rt;
	},

	readableCode: (line) => {
		if(Array.isArray(line[0])) {
			return line.map(readableCode).flat(Infinity);
		}
		let readable = [];
		for(let i = 0; i < line.length; i += VMLength[line[i]]) {
			readable.push(VMNames[line[i]]);
			let len = VMLength[line[i]];
			readable = readable.concat(line.slice(i+1, i+len));
		}
		return readable;
	},

	unify: (type1, type2) => {
		// Vector types can unify with vectors of a different length
		// so long as its length hasn't been specified yet
		if(Array.isArray(type1) && Array.isArray(type2)) {
			if(!Duet.unify(type1[0], type2[0])) {
				return false;
			}
			if(type1.length == 1 && type2.length == 2) {
				type1.push(type2[1]);
				return true;
			}
			else if(type2.length == 1 && type1.length == 2) {
				type2.push(type1[1]);
				return true;
			}
			else if(type1.length == 2 && type2.length == 2) {
				return type1[1] == type2[1];
			}
			return true;
		}
		return type1 == Type.unknown || type2 == Type.unknown || type1 == type2;
	},

	analyzeAll: () => {
		Duet.program = null;
		Duet.entityFiles = {};
		Duet.entities = {};
		let analysis = {
			entities: {}
		};

		for(let f in Duet.files) {
			analysis[f] = Duet.analyze(f);
			let e = analysis[f].entity.type[1];
			analysis.entities[e] = f;
		}

		for(let f in Duet.files){
			Duet.typeCheck(f, analysis);

			let errors = analysis[f].errors;
			Duet.logParseErrors(Duet.files[f], errors);
			if(errors.length > 0) {
				Duet.setPaused(true);
			}

			let entity = analysis[f].entity;
			let typeName = entity.type[1];

			Duet.entities[typeName] = entity;
			Duet.files[f].name = typeName;

			if(entity.type[0] == Type.program) {
				if(Duet.program) Duet.logError(`Only one program can exist. Found '${Duet.program}' and '${f}'`);
				else Duet.program = typeName;
			}
		}
		if(!Duet.program) {
			Duet.logError(`There must be one script marked as 'program' to start a game.`);
		}
	},

	analyze: (filename) => {
		let file = Duet.files[filename];
		let entity = {
			type: [],
			source: filename,
			count: 0,
			// Array of initializers
			toCreate: {
				plain: 0,
				special: []
			},
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
		let dependencies = [];
		let tokens = file.tokens;
		let lowText = Duet.files[filename].text.toLowerCase();

		let variables = {};
		let events = {};

		function err(message, node) {
			errors.push({message: message, start: node.start, length: node.length});
		}
		function tkText(index) {
			let token = tokens[index];
			return lowText.substr(token.start, token.length);
		}
		function defaultCode(node, type = Type.unknown, code = [], children = [], dependencies = []) {
			return {
				parseNode:node,
				type: type,
				update: Update.once,
				storage: Storage.static,
				code: code,
				children: children,
				dependencies: dependencies
			}
		}

		const AcType = {
			varName: 0,
			funcName: 1,
			ctor: 2,
			// Platform function that must be determined at the next phase of analysis
			overload: 3,
			index: 4,
			invalid: 5
		};

		/* Return a dictionary
			type: AcType,
			local: bool,
			ref: pointer (if platform),
			text: string[]
		*/
		function resolveAccessor(accessor) {
			function acInvalid(){
				return {type: AcType.invalid, text: [], local: true};
			}
			if(accessor.type != Duet.ParseNode.accessor) {
				err('BUG: this was supposed to be an accessor', accessor);
				return acInvalid();
			}
			if(accessor.length % 2 == 0) {
				err('Ill-formated accessor (either extra or missing periods)', accessor);
				return acInvalid();
			}
			let ac = [];
			for(let i = 0; i < accessor.length; i += 2) {
				let text = tkText(accessor.start + i);
				ac.push(text);
			}
			if(ac[ac.length - 1] == 'create') {
				if(ac.length != 2) {
					err('Identifier [create] is reserved for making objects using [name].create', accessor);
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
						return acInvalid();
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
			else {
				return {
					type: AcType.varName,
					local: true,
					text: ac
				};
			}
			return ac;
		}
		function ctorCode(ctorNode, ac) {
			function initCode() {
				return [VM.constant, {}];
			}
			let etype = ac.text[0];
			return defaultCode(
				ctorNode,
				[Type.entity, etype],
				[
					[VM.constant, etype],
					[VM.constant, 1],
					[VM.constant, true],
					initCode(),
					[VM.call, Duet.create, 4]
				]
			);
		}
		function accessorCode(acNode, ac) {
			switch(ac.type) {
			// Either a platform or local variable
			case AcType.varName: {
				if(ac.local) {
					if(ac.text.length == 1) {
						return defaultCode(
							acNode,
							Type.unknown,
							[ VM.localInstance, ac.text[0] ],
							[],
							[ac.text[0]]
						);
					}
					else {
						// Dependency on another entity
						dependencies.push(ac.text);
						return defaultCode(
							acNode,
							Type.unknown,
							[ VM.nonlocal, ac.text ]
						);
					}
				}

				if(!(ac.ref && 'type' in ac.ref)) {
					err(`Not a valid platform variable: ${ac.text.join('.')}`, acNode);
					return defaultCode(acNode);
				}
				let code = defaultCode(acNode, ac.ref.type);
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
					let code = defaultCode(acNode, ac.ref.return, [VM.call, ac.ref.s, 0]);
					code.update = v.update || Update.once;
					return code;
				}
			}
			case AcType.ctor: {
				return ctorCode(acNode, ac);
				break;
			}
			default:
				return defaultCode(acNode);
			}
		}
		/* A dictionary
			parseNode, type, update, storage,
			children: array of sub-expressions,
			code: unique code appended at the end of all sub-expression code
		*/
		function analyzeExp(expNode) {
			if(typeof(expNode) !== 'object' || !('type' in expNode)) {
				Duet.logError('Not a valid expression:', expNode);
				return defaultCode();
			}
			switch(expNode.type) {
			case Duet.ParseNode.accessor: {
				// Special case of creating nodes
				let c = resolveAccessor(expNode);
				return accessorCode(expNode, c);
			}
			case Duet.ParseNode.index: {
				return {
					parseNode: expNode,
					type: Type.unknown,
					update: Update.once,
					storage: Storage.static,
					children: expNode.children.map(analyzeExp),
					code: [VM.call, Duet.platform.opv.index, expNode.children.length]
				}
			}
			case Duet.ParseNode.number: {
				let workingText = '';
				for(let i = 0; i < expNode.length; i++) {
					workingText += tkText(expNode.start+i);
				}
				let n = Number(workingText);
				return defaultCode(expNode, Type.real, [VM.constant, n]);
			}
			case Duet.ParseNode.string: {
				let workingText = '';
				for(let i = 1; i < expNode.length - 1; i++) {
					let tok = tokens[expNode.start+i];
					if(tok.type == Duet.Token.stringText) {
						workingText += tkText(expNode.start+i);
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
				return defaultCode(expNode, Type.string, [VM.constant, workingText]);
			}
			case Duet.ParseNode.funCall:{
				let name = resolveAccessor(expNode.children[0]);
				if(!name) {
					err(`COMPILER BUG: Malformed function call.`, expNode);
					return defaultCode(expNode);
				}
				else if(name.type == AcType.ctor) {
					return ctorCode(expNode, name);
				}
				else if(name.type != AcType.funcName && name.type != AcType.overload) {
					err(`Unknown function: [${name.text.join('.')}]`, expNode.children[0]);
					return defaultCode(expNode);
				}

				if(name.local || !name.ref) {
					err(`Local functions not implemented yet: ${name.text.join('.')}`, expNode);
					return defaultCode(expNode);
				}
				let ref = name.ref;
				let args = expNode.children[1];
				if(args.type != Duet.ParseNode.valueList) {
					err(`Expected a list of arguments for the function ${name.text.join('.')}`, expNode);
					return defaultCode(expNode);
				}
				let minArgs;
				let maxArgs;
				if(name.type == AcType.funcName) {
					maxArgs = ref.args.length;
				}
				else {
					maxArgs = ref.argCount;
				}
				if('requiredArgs' in ref) {
					minArgs = ref.requiredArgs;
				}
				if(args.children.length > maxArgs) {
					err(`Function ${name.text.join('.')} expects at most ${maxArgs} arguments, but was given ${args.children.length} instead.`, args);
				}
				else if(args.children.length < minArgs) 
				{
					err(`Function ${name.text.join('.')} expects between ${minArgs}-${maxArgs} arguments, but was given ${args.children.length} instead.`, args);
				}
				return {
					parseNode: expNode,
					type: ref.return,
					update: ref.update || Update.once,
					storage: Storage.static,
					children: args.children.map(analyzeExp),
					code: [
						(ref.async? VM.callAsync : VM.call), 
						ref, args.children.length
					]
				}
			}
			case Duet.ParseNode.valueList: {
				return {
					parseNode: expNode,
					type: [Type.unknown, expNode.children.length],
					update: Update.once,
					storage: Storage.static,
					children: expNode.children.map(analyzeExp),
					code: [VM.array, expNode.children.length]
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
				return {
					parseNode: expNode,
					type: Type.unknown,
					update: Update.once,
					storage: Storage.static,
					children: expNode.children.slice(1).map(analyzeExp),
					code: [VM.call, tkText(op.start), expNode.children.length - 1]
				}
			}
			default:
				Duet.logError('Not supported:', Duet.printableTree(file, expNode));
				return defaultCode(expNode);
			}
		}
		function analyzeType(typeNode) {
			function typeName(index) {
				let node = typeNode.children[index];
			}
			function typeCount(index) {
				let node = typeNode.children[index];
				if(node.type != Duet.ParseNode.number) {
					err(`Expected a constant number to declare an array`, node);
				}
				if(node.length > 1) {
					err(`An array can only have positive integer size`, node);
				}
			}
			if(typeNode.children.length > 2) {
				err(`Types should either a name or a name, comma, and number, such as 'real' or 'real, 2'`, typeNode);
			}
			if(typeNode.children.length == 2) {
				return [typeName(0), typeCount(1)];
			}
			else {
				return typeName(0);
			}
		}

		let header = tree.children[0];
		if(header.type != Duet.ParseNode.header) {
			err(`Expected the program to start with a header, got ${Duet.ParseNodeNames[header.type]}`, header);
			entity.type = [Type.unknown, 'invalid'];
		}
		else {
			let type = tkText(header.start);
			let name = tkText(header.start + 1);
			if(!(type in Type) || (type != 'program' && type != 'entity')) {
				err(`Expected the script type to be [program] or [entity], found ${type}`, {start: header.start, length: 1});
			}
			if(name in Duet.entities) {
				err(`Entity class ${name} already exists`, header.start+1, 1);
			}
			entity.type = [Type[type], name];
		}
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
				//console.log('Binding: of ',name, Duet.printableTree(file, node));
				if(name in variables) {
					err(`Duplicate variable declaration: ${name}`, ident); 
				}
				let value1 = analyzeExp(node.children[1]);
				if(declaration.children.length > 1) {
					let declaredType = analyzeType(declaration.children[1]); 
					if(Duet.unify(value1.type, declaredType)) {
						err(`Conflicting types in ${type}.${name}. Declared as ${Duet.readableType(declaredType)}, but it was inferred as ${Duet.readableType(value1.type)}`);
					}
					value1.type = declaredType;
				}
				value1.order = i;
				value1.parseNode = node.children[0];
				// An initialization and an integration
				if(node.children.length == 2) {
					variables[name] = value1;
				}
				else if(node.children.length == 3) {
					variables[name] = value1;
					let v = variables[name];
					v.storage = Storage.instance;
					v.integrate = analyzeExp(node.children[2]);
				}
				else{
					err('COMPILER BUG: expected one or two values in binding', node);
				}
			}
			else if(node.type == Duet.ParseNode.event) {
				//console.log("Event:", Duet.printableTree(file, node));
				let cond = node.children[0];
				if(cond.type != Duet.ParseNode.accessor || cond.children.length > 1) {
					err(`Advanced conditions not implemented yet`, cond);
				}
				let name = tkText(cond.start);
				if(!(name in events)) {
					events[name] = [];
				}
				for(let i = 1; i < node.children.length; i++) {
					events[name].push(analyzeExp(node.children[i]));
				}
			}
			else {
				err(`Unexpected statement type: ${Duet.ParseNodeNames[node.type]}`, node);
			} 
		}
		return {
			entity:entity, 
			errors:errors, 
			dependencies: dependencies, 
			variables: variables, 
			events: events,
			lowText: lowText
		};
	},

	typeCheck: (filename, analysis) => {
		let info = analysis[filename];
		let checked = {};
		let entity = info.entity;
		let variables = info.variables;
		let events = info.events;
		let tokens = Duet.files[filename].tokens;

		function gatherDependencies() {
			function depUnify(expNode) {
				let d = expNode.dependencies || [];
				return expNode.children.reduce(
					(deps, node) => deps.concat(depUnify(node)),
					d
				);
			}
			let graph = {};
			for(let varname in variables) {
				let varNode = variables[varname];
				if('integrate' in varNode) {
					graph[varname] = depUnify(varNode.integrate).concat(depUnify(varNode));
				}
				else {
					graph[varname] = depUnify(varNode);
				}
			}
			return graph;
		}


		function tkText(index) {
			let token = tokens[index];
			return lowText.substr(token.start, token.length);
		}
		function err(message, node) {
			info.errors.push({message: message, start: node.start, length: node.length});
		}

		let dependencies = gatherDependencies();


		function isVectorValue(node) {
			return Array.isArray(node.type);
		}

		function checkExp(varname, node) {
			function known(type) {
				if(typeof(type) == 'string') {
					return true;
				}
				if(type == Type.unknown) {
					return false;
				}
				if(Array.isArray(type) && type[0] == Type.unknown) {
					return false;
				}
				return true;
			}
			if(node.children.length == 0) {
				if(known(node.type)) {
					node.code = node.code.flat(Infinity);
				}
				else if(node.code[0] == VM.localInstance) {
					let locName = node.code[1];
					if(locName in variables && variables[locName].type != Type.unknown) {
						let l = variables[locName];
						node.type = l.type;
						node.storage = Math.max(node.storage, l.storage);
						node.update = Math.max(node.update, l.update);
					}
					else {
						err(`COMPILER BUG: could not determine type of variable: '${locName}'`, node.parseNode);
					}
					if(node.storage == Storage.static) {
						node.code[0] = VM.localStatic;
					}
				}
				else if(node.code[0] == VM.nonlocal) {
					let id = node.code[1];
					let typename = id[0];
					// TypedAccess has a little more info
					// instead of, e.g. world.theplayer.position
					// it would be [world, theplayer, player, position]
					// encoding the sub-entity's type as well
					let typedAccess = [typename];
					if(typename in analysis.entities) {
						let entityInfo = analysis[analysis.entities[typename]];
						let realType = Type.unknown;
						let rootValue = entityInfo.variables[id[1]];
						// This is based on the storage of the root value.
						// Note that the 'update' is from the leaf value.
						node.storage = Math.max(node.storage, rootValue.storage);

						for(let i = 1; i < id.length; i++) {
							let valName = id[i];
							typedAccess.push(valName);
							let value = entityInfo.variables[valName];
							// Completely skip the nested access if it's a static type
							if(value.storage < Storage.instance && typedAccess.length > 2) {
								typedAccess = typedAccess.slice(-2);
							}
							node.update = Math.max(node.update, value.update);
							realType = value.type;
							if(!Array.isArray(value.type) || value.type[0] != Type.entity) {
								if(i < id.length - 1) {
									err(`COMPILER BUG: I don't know what '${valName}' means here.`, node.parseNode);
								}
								break;
							}
							let newType = value.type[1];
							if(newType in analysis.entities) {
								typedAccess.push(newType);
								entityInfo = analysis[analysis.entities[newType]];
							}
							else {
								err(`COMPILER BUG: Accessor '${valName}' is of an unknown entity type: '${newType}'`, node.parseNode);
							}
						}
						node.code[1] = typedAccess;
						node.type = realType;
					}
					else {
						err(`Type of accessor '${id.join('.')}' could not be determined.`, node.parseNode);
					}
				}
				return node;
			}
			// Either VM.call, VM.asyncCall, VM.array, or VM.localInstance
			let instr = node.code;
			let code = [];

			function unifyFunc() {
				let funcRef = instr[1];
				let funcName = funcRef;
				if(typeof(funcRef) == 'string') {
					function findBinOpGroup(vectorLeft, vectorRight) {
						let outerGroup = vectorLeft? Duet.platform.opv : Duet.platform.ops;
						let innerGroup = vectorRight? outerGroup.toV : outerGroup.toS;
						let name = Duet.OpNames[funcRef];
						funcName = `[${funcRef}] (${name})`;
						function vname(v) {
							return v? 'vector': 'scalar';
						}
						if(!(name in innerGroup)) {
							err(`Operator ${funcName} not found between ${vname(vectorLeft)} and ${vname(vectorRight)} values`, node.parseNode);
														return null;
						}
						return innerGroup[name];
					}
					if(node.children.length == 2) {
						funcRef = findBinOpGroup(
							isVectorValue(node.children[0]),
							isVectorValue(node.children[1]));
					}
					else {
						err(`Operator ${funcName} expected 2 arguments, got ${node.children.length}`, node.parseNode);
						return;
					}
				}
				else if('overload' in funcRef) {
					let isVector = Array.isArray(node.children[0].type);
					funcRef = Duet.platform[
						isVector ? 'opv' : 'ops'
					][funcRef.overload];
					funcName = funcRef.overload;
				}
				else {
					funcName = funcRef;
				}
				// Scalar/vector function
				let subType = '';
				for(let i = 0; i < node.children.length; i++) {
					let c = node.children[i];
					let expType = funcRef.args[i];
					if(!Duet.unify(expType, c.type)) {
						err(`Function ${funcName}: Expected argument ${i} to be of type ${Duet.readableType(expType)}. Received ${Duet.readableType(c.type)}`, node.parseNode);
					}
					subType += (c.storage == Storage.instance) ? 'v' : 's';
					code = code.concat(c.code);
				}
				if(!(subType in funcRef)) {
					err(`COMPILER BUG: Could not overload function [${funcName}] for type: [${subType}]`, node.parseNode);
				} 
				let realFunc = funcRef[subType];
				node.code[1] = realFunc;
				node.type = funcRef.return;
				node.code = code.concat(node.code);
				return node;
			}

			function unifyArray() {
				let elemType = Type.unknown;
				let code = [];
				for(let i = 0; i < node.children.length; i++) {
					let c = node.children[i];
					if(!Duet.unify(elemType, c.type)) {
						err(`Started a list of ${Duet.readableType(elemType)}, but found ${Duet.readableType(c.type)} value.`, c.parseNode);
					}
					else {
						elemType = c.type;
					}
					code = code.concat(c.code);
				}
				node.type = [elemType, node.children.length];
				node.code = code.concat(node.code);
			}

			for(let i = 0; i < node.children.length; i++) {
				let c = node.children[i];
				checkExp(varname, c);
				node.update = Math.max(node.update, c.update);
				node.storage = Math.max(node.storage, c.storage);
				// Figure out how to do inference and unification for the given instruction
			}
			let unifyChildren;
			switch(node.code[0]) {
			case VM.call:
			case VM.callAsync:
				unifyChildren = unifyFunc;
				break;
			case VM.array:
				unifyChildren = unifyArray;
				break;
			default:
				err(`COMPILER BUG: Unification of VM.${VMNames[node.code[0]]} Not implemented.`, node.parseNode);
				unifyChildren = () => {};
				break;
			}
			unifyChildren();
			// TODO: figure out unifying the types
			return node;
		}

		function checkVar(varname, visited = []) {
			if(varname.endsWith('#integrate')) {
				varname = varname.substr(0, varname.indexOf('#'));
			}
			let varNode = variables[varname];
			if(varname in checked || visited.includes(varname)) {
				return varNode;
			}
			for(let i = 0; i < dependencies[varname].length; i++) {
				let dep = dependencies[varname][i];
				if(dep == varname) {
					// For now: self-dependent variables 
					// are always updated each frame and per-instance
					varNode.update = Update.frame;
					varNode.storage = Storage.instance;
					continue;
				};
				// We don't need to figure out dependencies' types 
				//  if we know this value's type
				if(varNode.type == Type.unknown) {
					visited.push(dep);
					checkVar(dep, visited);
				}
			}
			checked[varname] = checkExp(varname, varNode);
			if('integrate' in varNode) {
				let t2 = checkExp(varname, varNode.integrate);
				if(!Duet.unify(varNode.type, t2.type)) {
					err(`Initial value and integration for ${varname} have differing types: ${Duet.readableType(varNode.type)} versus ${Duet.readableType(t2.type)}`, varNode.parseNode);
				}
			}
			return varNode;
		}
		function printableExp(val) {
			let rtype = Duet.readableType(val.type);

			let rChildren = {};
			for(let c in val.children) {
				rChildren[c] = printableExp(val.children[c]);
			}

			let r = {
				type: Duet.readableType(val.type),
				update: UpdateNames[val.update],
				storage: StorageNames[val.storage],
				code: Duet.readableCode(val.code),
				children: rChildren
			};
			if('integrate' in val) {
				r.integrate = printableExp(val.integrate);
			}
			return r;
		}
		for(let varname in variables) {
			checkVar(varname);

			if(varname.endsWith('#integrate')) {
				varname = varname.substr(0, varname.indexOf('#'));
			}
			let varNode = variables[varname];
			let result = {
				type: Duet.readableType(varNode.type),
				update: UpdateNames[varNode.update],
				storage: StorageNames[varNode.storage],
				code: varNode.code
			};
			if('integrate' in varNode) {
				result.integrate = {
					type: Duet.readableType(varNode.integrate.type),
					update: UpdateNames[varNode.integrate.update],
					storage: StorageNames[varNode.integrate.storage],
					code: varNode.integrate.code
				};
			}
			//console.log(varname, 'typeInfo:', result);
			// Apply all the computation things after resolving types and overloads
			entity.values[varname] = varNode.storage == Storage.instance? [] : null;
			if(varNode.update == Update.once) {
				if(varNode.storage == Storage.instance){
					entity.compute.creation.push([varname, varNode.code]);
				} 
				else {
					entity.compute.allocation.push([varname, varNode.code]);
				}
			}
			else if(varNode.update == Update.frame) {
				if('integrate' in varNode) {
					entity.compute.creation.push([varname, varNode.code]);
					entity.compute.frame.push([varname, varNode.integrate.code]);
				}
				else {
					entity.compute.frame.push([varname, varNode.code]);
				}
			}
		}
		for(let eventName in events) {
			let eventCode = [];
			if(!(eventName in variables)) {
				err(`Event Name '${eventName}' does not match any local variables.`, events[eventName][0].parseNode);
				continue;
			}
			let eventStorage = variables[eventName].storage;

			// For now, there's no conditional events
			for(let i = 0; i < events[eventName].length; i++) {
				let line = events[eventName][i];
				checkExp(eventName, line);
				eventCode = eventCode.concat(line.code);
			}
			entity.events[eventName] = {do: eventCode, storage: eventStorage};
		}
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