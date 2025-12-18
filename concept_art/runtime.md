Runtime:

Atomic values or "atoms" versus structural data types called "entities".
Atoms

- Initialization
	- Allocate program
	- Initialize program variables
	- Collect creation messages
- Each Frame:
	- Apply messages
		- Create/delete new objects
	- Get system values
	- Apply dependencies
		- Collect Events
	- Fire events
		- Collect messages


How to make things work:
Let's examine `player.duet`
```
entity player

sprite = file.loadsprite('assets/player.png')
speed = 10.0
movement = [keyboard.right - keyboard.left, keyboard.down - keyboard.up]
position = canvas.size/2; clamp(position + movement * speed, [0,0], canvas.size)

position
	canvas.drawSprite(sprite, position)
```

When this is compiled and loaded, several things happen:
Every type of entity has a table created with a format like below, though with no values:

```
player: {
	count: 1,
	// Number to create/free next frame
	toCreate: 0,
	toFree: 0,
	// Describes when to recompute each value, and the order to do it.
	compute: {
		// When the entity class is allocated for the first time
		allocation: [
			['sprite', {call: platform.file.loadsprite.s, args:['assets/player.png'] }],
			['speed', [VM.constant: 10.0]]
		],
		// Computed upon entity is creation, for just the created value
		creation: [
			// Values are evaluated by a list of instructions on a stack-based VM thing
			['position', [
				// VM.call, function reference, number of arguments (or 0 if omitted)
				VM.call, platform.canvas.size.get, 0,
				// VM.constant, value
				VM.constant, 2,
				VM.call, platform.opv.divs.ss, 2
			]]
		],
		// Changes every frame, for every entity
		frame: [
			['movement', [
				VM.call, platform.keyboard.right.get, 0,
				VM.call, platform.keyboard.left.get, 0,
				VM.call. platform.ops.sub.ss, 2,
				
				VM.call, platform.keyboard.down.get, 0,
				VM.call, platform.keyboard.up.get, 0,
				VM.call, platform.ops.sub.ss, 0,

				VM.array, 2
			]], 
			['position', [
				VM.local, 'position',
				VM.local, 'movement',
				VM.local, 'speed',
				VM.call, platform.opv.muls.ss, 2,
				VM.call, platform.opv.add.vs, 2,
				VM.constant, [0,0],
				VM.call, platform.canvas.size.get, 0,
				VM.call, platform.clamp.vss, 3
			]]
		],
		// A set of variables that only change when their dependencies change, which is not every frame
		// none for this example
		listening: []
		// Variables that receive their value as a message
		// None for this example
		message: []
	}
	values: {
		// Initialized to default values based on type
		speed: 0.0,
		sprite: null,
		movement: [0,0],
		position: [[0,0]]
	},
	events: {
		position: [
			{do: [
				Instr.local, 'sprite', 
				Instr.local, 'position',
				Instr.call, canvas.drawsprite.sv, 2,
			]}
		]
	},
	// External references will need a layer of indirection, since they can be reorganized when objects are removed
	// This emulates the reference from the game to the player
	references: [0],
	// Free references. Indeces into a list of indeces into the entities table
	freelist: []
}
```

Pseudocode for creation and running each frame:

```
function create(type, refer) {
	let et = entities[type];
	id = et.count + et.toCreate - et.toFree;
	et.toCreate += 1;
	// Create a permanent reference to this node.
	if(refer) {
		if(freelist.length) {
			let ref = freelist.pop();
			et.references[ref] = id;
			return ref;
		}
		else {
			let ref = et.references.length;
			et.references.push(id);
			return ref;
		}
	}
	else {
		return id;
	}
}

function frame() {
	let messages = [];

	for(let t in entities) {
		let type = entities[t];
		type.count -= type.toFree;
		if(type.toCreate) {
			allocate(t, type.toCreate);
			for(let c in type.compute.creation) {
				let name = c[0];
				type.values[name][i..type.count] = eval(type, c[1]);
			}
		}
		type.toFree = 0;
		type.toCreate = 0;

		for(let fvar in type.compute.frame) {
			let fname = fvar[0];
			type.values[fname] = eval(fvar[1]);
			if(fname in type.events) {
				let event = type.events[fname];
				if('condition' in event) {
					let indeces = [];
					for(let i = 0; i < type.count; i++) {
						if(event.condition(type, i)) {
							indeces.push(i);
						}
					}
					messages.push({message: event.message, entity: type, indeces: indeces});
				}
				else {
					messages.push(event.message);
				}
			}
		}
		for(let msg of messages) {
			(apply messages)
		}
	}
}
```