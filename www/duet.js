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
	object: 7
};

const Update = {
	constant: 0,
	frame: 1,
	variable: 2
}

const Duet = {
	// A dictionary
	// name of object/file -> {path:String, text:String, type:String, element:Element}
	canvas: undefined,
	files: {},
	activeFile: undefined,
	// Our "standard library"
	platform: {
		canvas: {
			type: Type.struct,
			update: Update.variable,
			clearcolor: {
				type: [Type.real, 3],
				value: [1,1,1]
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
			value: 33
		},
		loadsprite: {
			type: Type.function,
			update: Update.constant,
			arguments: [Type.string],
			return: Type.object,
			fn: async (paths) => {
				return await Promise.all(paths.map(async (path) => {
					let response = await fetch(path);
					if(!response.ok) {
						return null;
					}
					const blob = await response.blob();
					const url = URL.createObjectURL(blob);
					const img = document.createElement('img');
					img.src = url;
					return img;
				}));
			}
		},
		keyboard: {
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
		clamp: {
			type: Type.function,
			arguments: [Type.real, Type.real, Type.real],
			return: Type.real,
			fn: (values, mins, maxs) => {
				let result = [];
				result.length = values.length;
				for(let i = 0; i < values.length; i++) {
					let value = values[i];
					let min = mins[i];
					let max = maxs[i];

					if(value > max) {
						result[i] = max;
					}
					else if(value < min) {
						result[i] = min;
					}
					else result[i] = value;
				}
				return result;
			}
		}
	},

	// Set once per script
	constants: {},
	vars: {},
	press: (e) => {
		Duet._keySet(e.key, 1);
	},
	_keySet: (key, val) => {
		switch(key) {
		case "ArrowUp":
			Duet.platform.keyboard.up.value = val;
			break;
		case "ArrowDown":
			Duet.platform.keyboard.down.value = val;
			break;
		case "ArrowLeft":
			Duet.platform.keyboard.left.value = val;
			break;
		case "ArrowRight":
			Duet.platform.keyboard.right.value = val;
			break;
		}
	},
	release: (e) => {
		Duet._keySet(e.key, 0);
	},

	run: async () => {
		let images = await Duet.platform.loadsprite.fn(['/assets/player.png']);
		Duet.canvas.onkeydown = Duet.press;
		Duet.canvas.onkeyup = Duet.release;
		Duet.constants = {
			player:{
				sprite: images[0],
				speed: 10.0
			}
		};
		Duet.vars = {
			player:{
				position: [[0,0]]
			}
		}

		// TODO: get from code
		let systemInitializers = [
			['canvas', 'clearcolor', [0,0,0]]
		];

		for(let init of systemInitializers) {
			let struct = Duet.platform;
			let lastIndex = init.length-1;
			for(let i = 0; i < lastIndex; i++) {
				struct = struct[init[i]];
			}
			console.log(init);
			if('set' in struct) {
				struct.set(init[lastIndex]);
			}
			else{
				struct.value = init[lastIndex];
			}
		}
		setTimeout(Duet.frame, Duet.platform.deltams.value);
	},
	frame: () => {
		let canvas = Duet.canvas;
		let draw2d = canvas.getContext('2d');
		{
			let cc = Duet.platform.canvas.clearcolor.value;
			draw2d.fillstyle = `rgb(${255*cc[0]}, ${255*cc[1]}, ${255*cc[2]})`;
			draw2d.fillRect(0, 0, canvas.width, canvas.height);
		}

		// Player updates
		let pp = Duet.vars.player.position;
		let kb = Duet.platform.keyboard;
		let movement = [kb.right.value - kb.left.value, kb.down.value - kb.up.value];
		for(let i = 0; i < pp.length; i++) {
			let s = Duet.constants.player.speed;
			pp[i] = Duet.platform.clamp.fn([
				pp[i][0] + s * movement[0],
				pp[i][1] + s * movement[1]
			], [0,0], [Duet.canvas.width, Duet.canvas.height]);
			draw2d.drawImage(Duet.constants.player.sprite, pp[i][0], pp[i][1]);
		}

		Duet.platform.frame.value += 1;
		if(!Duet.platform.paused.value) {
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
	parse_all() {
		for(f in Duet.files) {
			Duet.files[f].parseTree = Duet.parse(Duet.files[f]);
		}
		Duet.showParseResults();
	},
	compileAndRun: () => {
		Duet.compile();
		Duet.run();
	},
	compile: () => {
		console.log('DUET: Compiling');
		Duet.lex();
		Duet.parse_all();
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
	}
};

for(let k in Duet.Token) {
	Duet.TokenNames[Duet.Token[k]] = k;
}
for(let k in Duet.ParseNode) {
	Duet.ParseNodeNames[Duet.ParseNode[k]] = k;
}