# Delta for social-notifications

New capability (greenfield, Cut 3). No feed, comments, chat, or public challenges. Ownership tags: [API], [Mobile], [Shared].

## ADDED Requirements

### Requirement: Push Token Registration

[Mobile] The app MUST request push notification permission and register the device push token with the API. If permission is denied, the app MUST continue working without push and not re-prompt aggressively.

#### Scenario: Token registered

- GIVEN granted push permission
- WHEN the app starts authenticated
- THEN the device token is sent to the API and stored for the user

#### Scenario: Permission denied

- GIVEN denied push permission
- WHEN the app starts
- THEN the app functions normally without notifications

### Requirement: Challenge Invite Push Notification

[Shared] When a user is invited to a challenge, the API MUST send a push notification to the invitee's registered devices. Tapping the notification MUST open the invite screen in the app.

#### Scenario: Invite received

- GIVEN an invitee with a registered push token
- WHEN a friend invites them to a challenge
- THEN a push notification arrives naming the challenge and inviter

#### Scenario: Tapping opens invite

- GIVEN a received invite notification
- WHEN the user taps it
- THEN the app opens the challenge invite screen with accept/decline actions

### Requirement: Challenge Event Notifications

[API] The system SHOULD send push notifications for challenge events: challenge started and challenge ended, to all members with registered tokens.

#### Scenario: Challenge started event

- GIVEN members with registered tokens
- WHEN a live challenge starts
- THEN all members receive a "challenge started" notification

### Requirement: Challenge History

[Shared] The system MUST provide a list of the user's past challenges (completed or ended), including name, dates, type, and the user's final rank. The API MUST return history newest-first.

#### Scenario: History populated

- GIVEN a user with completed challenges
- WHEN they open the history screen
- THEN past challenges appear newest-first with final rank

#### Scenario: Empty history

- GIVEN a user with no past challenges
- WHEN they open history
- THEN an empty state is shown

### Requirement: User Stats

[Shared] The system MUST provide aggregate stats per user: total challenges joined, wins, and cumulative distance/steps. The Mobile app MUST display these on a stats screen.

#### Scenario: Stats displayed

- GIVEN a user with challenge history
- WHEN they open the stats screen
- THEN challenges joined, wins, and cumulative totals are shown and match the API response
