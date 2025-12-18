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