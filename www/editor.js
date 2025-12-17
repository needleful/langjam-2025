"use strict";

class Editor {
	/*
		This is an adaptation of Brad Robinson's
		Source: https://stackoverflow.com/a/45396754/2107659
		I have stolen the code from gcoulby: https://jsfiddle.net/2wkrhxLt/8/
		Change Log:
		- Removed the dependency to jQuery
		- Integrated into TypeScript class
		- Converted to busted Javascript (this was I, needleful)
	*/
	text;
	enabled = true;
	keydown = (evt) => {
		this.text = evt.target;
		switch(evt.key) {
		case "Escape":
			evt.preventDefault();
			this.enabled = !this.enabled;
			if(this.status) {
				this.status.innerText = (this.enabled? "Tab Captured" : "Tab Free") + ". Press Escape to Toggle";
			}
			return false;
		case "Enter":
			if(evt.ctrlKey) {
				this.run();
			}
			//break;
			else if (this.text.selectionStart == this.text.selectionEnd) {
				// find start of the current line
				var sel = this.text.selectionStart;
				var text = this.text.value;
				while (sel > 0 && text[sel-1] != '\n') {
					sel--;
				}
				
				var lineStart = sel;
				while (text[sel] == ' ' || text[sel]=='\t')
				sel++;
				
				if (sel > lineStart) {
					evt.preventDefault();
					// Insert carriage return and indented text
					document.execCommand('insertText', false, "\n" + text.substr(lineStart, sel-lineStart));

					// Scroll caret visible
					this.text.blur();
					this.text.focus();
					return false;
				}
			}
			break;
		case "Tab":
			if(!this.enabled) break;
			evt.preventDefault();
			// selection?
			if (this.text.selectionStart == this.text.selectionEnd) {
				// These single character operations are undoable
				if (!evt.shiftKey) {
					document.execCommand('insertText', false, "\t");
				}
				else {
					var text = this.text.value;
					if (this.text.selectionStart > 0 && text[this.text.selectionStart-1]=='\t') {
						document.execCommand('delete');
					}
				}
			}
			else {
				// Block indent/unindent trashes undo stack.
				// Select whole lines
				var selStart = this.text.selectionStart;
				var selEnd = this.text.selectionEnd;
				var text = this.text.value;
				while (selStart > 0 && text[selStart-1] != '\n')
					selStart--;
				while (selEnd > 0 && text[selEnd-1]!='\n' && selEnd < text.length)
					selEnd++;

				// Get selected text
				let lines = text.substr(selStart, selEnd - selStart).split('\n');

				// Insert tabs
				for (var i=0; i<lines.length; i++) {
					// Don't indent last line if cursor at start of line
					if (i==lines.length-1 && lines[i].length==0)
						continue;

					// Tab or Shift+Tab?
					if (evt.shiftKey) {
						if (lines[i].startsWith('\t'))
							lines[i] = lines[i].substr(1);
						else if (lines[i].startsWith("    "))
							lines[i] = lines[i].substr(4);
					}
					else
						lines[i] = "\t" + lines[i];
				}
				let output = lines.join('\n');

				// Update the text area
				this.text.value = text.substr(0, selStart) + output + text.substr(selEnd);
				this.text.selectionStart = selStart;
				this.text.selectionEnd = selStart + output.length; 
			}
			return false;
		}
		return true;
	}
	constructor(textarea) {
		this.text = textarea;
		this.text.addEventListener("keydown", this.keydown.bind(this));
	}

	setContent = (text) => {
		this.text.value = text;
	}

	run = () => {
		console.log('Not bound');
	}
}

function sync_scroll() {
	/* Scroll result to scroll coords of event - sync with textarea */
	let highlight = document.getElementById("highlighting");
	// Get and set x and y
	highlight.scrollTop = editor.text.scrollTop;
	highlight.scrollLeft = editor.text.scrollLeft;
}