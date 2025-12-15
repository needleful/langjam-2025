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

const Duet = {
	// A dictionary
	// name of object/file -> {path:String, text:String, type:String, element:Element}
	files: {},
	activeFile: undefined,
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
	compile: () => {
		console.log('DUET: Definitely compiling!!');
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
		function processTree(t) {
			for(let node of t) {
				for(let i = node.start; i < node.start+node.length;i++) {
					tokens[i].span.classList.add('code-'+Duet.ParseNodeNames[node.type]);
				}
			}
		}
		processTree(result.tree);
		for(let err of result.errors) {
			//console.error('Parsing error: ', err.message);
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
		// catch-all for all non-whitespace characters
		const r_operator = /^\S+/;
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
			|| grabString(Duet.Token.parentEnd, ')')
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
		error:0,
		header:1
	},
	ParseNodeNames: {},
	parse: (file)=> {
		const opPrecedence = {
			primary:0,
			'*':2, '/':2, '%':2, '^':1,
			'+':3, '-':3,
			'<':4, '<=':4, '>=':4, '>':4, '==':4, '!=':4,
			'~':5, '&':6, '|':7, '->':8
		};

		let tk = 0;
		let root = [];
		let tree = root;
		let errors = [];
		let tokens = file.tokens;
		let lowText = file.text.toLowerCase();

		function isGood() {
			return tk < tokens.length;
		}

		function peek() {
			return tokens[tk];
		}

		function tkText(token) {
			return lowText.substr(token.start, token.length);
		}

		function addNode(type, length) {
			var t = {
				type: type,
				start:tk,
				length: length
			};
			tree.push(t);
			tk += length;
			return t;
		}

		function parseError(text) {
			errors.push({start: tk, message: text});
			addNode(Duet.ParseNode.error, 1);
		}

		function header() {
			let token = peek();
			if(token.type != Duet.Token.ident) {
				return false;
			}
			let type = tkText(token);
			if(type != 'program' && type != 'entity') {
				return false;
			}
			let headNode = addNode(Duet.ParseNode.header, 1);
			if(!isGood()) {
				parseError('header ended early');
				return false;
			}
			let nToken = peek();
			if(nToken.type != Duet.Token.ident) {
				parseError(`Expected a name after header type [${type}]`);
				return false;
			}
			let name = tkText(nToken);
			tk += 1;
			headNode.length += 1;
			return true;
		}

		function skipNewlines() {
			while(isGood() && tokens[tk].type == Duet.Token.newline) {
				tk++;
			}
		}

		function grab(fn, skipComments = true) {
			if(skipComments) {
				while(isGood() && tokens[tk].type == Duet.Token.comment) {
					tk ++;
					skipNewlines();
				}
			}
			return isGood() && fn();
		}

		skipNewlines();
		if(!grab(header)) {
			parseError('expected the program to start with either [program] or [entity] and a name');
		}

		while(isGood()) {
			parseError('not implemented lol');
		}
		return {tree: root, errors: errors};
	},
};

for(let k in Duet.Token) {
	Duet.TokenNames[Duet.Token[k]] = k;
}
for(let k in Duet.ParseNode) {
	Duet.ParseNodeNames[Duet.ParseNode[k]] = k;
}