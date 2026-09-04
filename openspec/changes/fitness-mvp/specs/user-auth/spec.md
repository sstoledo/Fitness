# Delta for user-auth

New capability (greenfield). Ownership tags: [API] backend, [Mobile] app, [Shared] contract.

## ADDED Requirements

### Requirement: User Registration

[Shared] The system MUST allow a new user to register with email and password. The API MUST validate email format and enforce a minimum password length of 8 characters, and MUST reject duplicate emails with HTTP 409. The Mobile app MUST surface field-level validation errors before submission.

#### Scenario: Successful registration

- GIVEN a user without an existing account
- WHEN they submit a valid email and a password of 8+ characters
- THEN the API creates the account and returns 201 with a session token
- AND the Mobile app navigates to the home screen authenticated

#### Scenario: Duplicate email rejected

- GIVEN an account already exists for the email
- WHEN registration is submitted with that email
- THEN the API returns 409 and Mobile shows "email already in use"

#### Scenario: Weak password rejected

- GIVEN a password shorter than 8 characters
- WHEN registration is submitted
- THEN the API returns 400 and no account is created

### Requirement: Login and Session Issuance

[API] The system MUST authenticate users with email/password and issue a session token on success. The API MUST return HTTP 401 for invalid credentials without revealing which field failed.

#### Scenario: Successful login

- GIVEN a registered user
- WHEN they log in with correct credentials
- THEN the API returns 200 with a session token

#### Scenario: Invalid credentials

- GIVEN a registered user
- WHEN they log in with a wrong password
- THEN the API returns 401 with a generic "invalid credentials" message

### Requirement: Session Persistence and Auth Gate

[Mobile] The app MUST persist the session token in secure storage, MUST attach it to every API request, and MUST route unauthenticated users to the login screen. An expired or rejected token MUST clear local session and return to login.

#### Scenario: Session restored on relaunch

- GIVEN a stored valid session token
- WHEN the app is relaunched
- THEN the user lands on home without re-login

#### Scenario: Expired session forces re-login

- GIVEN a stored token that the API rejects with 401
- WHEN any authenticated request is made
- THEN the app clears the session and shows the login screen

### Requirement: Logout

[Shared] The system MUST allow logout, invalidating the session server-side and clearing the stored token on Mobile.

#### Scenario: Logout

- GIVEN an authenticated user
- WHEN they log out
- THEN the API invalidates the session and Mobile clears the token and shows login
