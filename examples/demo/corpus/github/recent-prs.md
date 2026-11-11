```
$ gh pr list --state merged --limit 8

Showing 8 of 191 pull requests in larder/larder that match your search

ID    TITLE                                           BRANCH                            CREATED AT
#220  Idempotency key for Stripe webhook retries      devr/stripe-webhook-idempotency   about 2 days ago
#219  Add `last_edited_by` to list items              devr/item-last-edited-by          about 7 days ago
#218  Exponential backoff for sync retries            lzhou/sync-retry-backoff          about 12 days ago
#217  Bump Kotlin to 2.3, AGP to 9.1                  lzhou/android-toolchain-bump      about 13 days ago
#216  Invite links: single use, expire after 7 days   devr/invite-link-expiry           about 13 days ago
#215  Dark mode: raise contrast on checked items      lzhou/dark-mode-checked-contrast  about 13 days ago
#214  Viewer role can't check off items               devr/viewer-role-permissions      about 14 days ago
#213  iPad: don't re-present item sheet on rotate     lzhou/ipad-rotate-sheet           about 15 days ago

$ gh pr view 216 --json title,labels,files --jq '{title, labels: [.labels[].name], files: [.files[].path]}'
{
  "title": "Invite links: single use, expire after 7 days",
  "labels": ["sharing", "api"],
  "files": [
    "api/app/controllers/invites_controller.rb",
    "api/app/models/household_invite.rb",
    "api/db/migrate/20261015_add_expires_at_to_household_invites.rb",
    "api/spec/requests/invites_spec.rb",
    "ios/Larder/Sharing/InviteLinkView.swift",
    "android/app/src/main/java/app/larder/sharing/InviteLinkScreen.kt"
  ]
}

$ gh pr view 214 --json title,labels --jq '{title, labels: [.labels[].name]}'
{
  "title": "Viewer role can't check off items",
  "labels": ["sharing", "permissions", "api"]
}
```
