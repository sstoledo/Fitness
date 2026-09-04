# Delta for live-gps-challenges

New capability (greenfield, Cut 2). GPS challenges are run/walk/bike only, no routing. Ownership tags: [API], [Mobile], [Shared].

## ADDED Requirements

### Requirement: Live GPS Challenge Lifecycle

[Shared] The system MUST allow an authenticated user to create and start a live GPS challenge, inviting members before start. Only members MUST be able to join its realtime session. The challenge type MUST be one of run, walk, or bike.

#### Scenario: Start live challenge

- GIVEN an authenticated user
- WHEN they create and start a GPS challenge with invited friends
- THEN the API activates the challenge and opens its realtime session

#### Scenario: Non-member cannot join session

- GIVEN a user who is not a challenge member
- WHEN they attempt to join the realtime session
- THEN the API rejects the join

### Requirement: Background Location Capture

[Mobile] During an active live challenge, the app MUST capture GPS in the background with adaptive sampling: every 3–5 seconds while moving and every 30–60 seconds while idle. The app MUST send a heartbeat at least every 30 seconds and MUST stop tracking when the challenge ends or the user leaves it.

#### Scenario: Moving user sampled frequently

- GIVEN an active live challenge with background permission
- WHEN the user is moving
- THEN positions are captured every 3–5 seconds and streamed

#### Scenario: Idle user sampled sparsely

- GIVEN an active live challenge
- WHEN the user is stationary
- THEN sampling drops to 30–60 seconds and heartbeats continue

### Requirement: Realtime Position Broadcast

[API] The system MUST broadcast each member's positions to all members of the same challenge room in realtime (Socket.io rooms backed by Redis). Positions MUST be scoped to their challenge room only.

#### Scenario: Position delivered to room members

- GIVEN two members in the same live challenge session
- WHEN member A sends a position
- THEN member B receives member A's position with coordinates and timestamp

#### Scenario: Cross-room isolation

- GIVEN two different live challenges
- WHEN a position is sent in challenge 1
- THEN no member of challenge 2 receives it

### Requirement: Live Map Rendering

[Mobile] The app MUST render a live map showing the user's own route polyline and friends' latest positions as markers, animating marker movement with interpolation between updates. The app MUST visually mark friends whose heartbeat is stale.

#### Scenario: Friend marker interpolates

- GIVEN a friend's successive positions
- WHEN a new position arrives
- THEN their marker animates smoothly to the new location

#### Scenario: Stale friend marked inactive

- GIVEN no heartbeat from a friend for over 60 seconds
- WHEN the map renders
- THEN their marker shows an inactive state
