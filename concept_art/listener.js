Update.listen

// A simple system for naming the listeners?
// Basically, 
let triggers = {
	':input.up': ['#player.movement'],
	':input.down': ['#player.movement'],
	':input.left': ['#player.movement'],
	':input.right': ['#player.movement'],
	'#player.movement': []
}

// All variables that listen
let listeners = {
	'#player.movement': {
		update: false,
		// How to update this variable when its sources change
		onupdate: []
	},
	'#player.position': false
}