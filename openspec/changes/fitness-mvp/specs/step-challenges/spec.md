# Delta for step-challenges

New capability (greenfield, Cut 1). Ownership tags: [API], [Mobile], [Shared].

## ADDED Requirements

### Requirement: Create Step Challenge

[Shared] The system MUST allow an authenticated user to create a private, invite-only step challenge with a name, start date, and end date. The API MUST reject creation with an end date not after the start date. Challenges MUST NOT be publicly discoverable.

#### Scenario: Create challenge

- GIVEN an authenticated user
- WHEN they create a challenge with valid name and date range
- THEN the API returns 201 with the challenge and the creator as first member

#### Scenario: Invalid date range

- GIVEN an end date before the start date
- WHEN creation is submitted
- THEN the API returns 400 and no challenge is created

### Requirement: Join Challenge via Invite

[Shared] The system MUST allow invited users to join a challenge. The API MUST enforce a maximum of 20 members per challenge and MUST reject joins by non-invited users with 403.

#### Scenario: Invited user joins

- GIVEN a user with a valid invite to a challenge below capacity
- WHEN they accept the invite
- THEN the API adds them as a member and returns 200

#### Scenario: Challenge at capacity

- GIVEN a challenge with 20 members
- WHEN an invited user tries to join
- THEN the API returns 409 "challenge full"

### Requirement: Health Data Step Sync

[Mobile] The app MUST read daily step counts from HealthKit (iOS) / Health Connect (Android) after explicit permission, and MUST upload steps to the API in idempotent batches keyed by date. If permission is denied, the app MUST show an explanatory empty state.

#### Scenario: Steps synced

- GIVEN granted health permission and an active challenge
- WHEN the app syncs
- THEN today's step count is uploaded and reflected in the leaderboard

#### Scenario: Duplicate sync is idempotent

- GIVEN steps for a date already uploaded
- WHEN the same date is synced again
- THEN the API updates the existing entry instead of duplicating it

#### Scenario: Permission denied

- GIVEN health permission was denied
- WHEN the challenge screen opens
- THEN the app shows a permission explanation and no step data

### Requirement: Daily Leaderboard

[Shared] The system MUST provide a daily leaderboard per challenge, ordered by step count descending, with the requester highlighted. All members MUST see identical standings for the same day.

#### Scenario: Two members see same leaderboard

- GIVEN two members with different step counts today
- WHEN both request the leaderboard
- THEN both receive the same ordering, member names, and step totals

#### Scenario: Tie in step counts

- GIVEN two members with equal step counts
- WHEN the leaderboard is requested
- THEN they share the same rank, ordered deterministically (e.g., by join date)
