# IMCHSI deep-route performance fix

Fixed the `/echo`, `/stress-test`, and `/holter` deep-route freeze by preventing
unfiltered Firestore subscriptions during initial FacilityContext hydration.

Changes:
- Appointment pages wait for the saved facility before subscribing to Firestore.
- The header notification listener also waits for facility hydration.
- Removed automatic Firestore seed/write operations from every appointment-page mount.
  Default seed data should not be written by normal visitors.
- Existing route structure and Firebase CRUD behavior are otherwise unchanged.

Deploy with the existing GitHub Actions workflow by pushing these source changes
to `main`.
