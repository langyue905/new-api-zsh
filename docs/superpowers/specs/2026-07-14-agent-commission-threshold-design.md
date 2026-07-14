# Agent Commission Threshold Change

## Goal

Keep the automatic agent commission rates at 7%, 10%, and 13%, while changing the cumulative invited-customer consumption thresholds to 100 and 10,000 units.

## Behavior

- Automatic agents earn 7% below 100 units of cumulative customer consumption.
- The transaction that brings cumulative consumption to 100 units is paid at 10%.
- Automatic agents remain at 10% from 100 units up to, but not including, 10,000 units.
- The transaction that brings cumulative consumption to 10,000 units is paid at 13%.
- Existing commission records and balances are not recalculated.
- Manual commission-rate overrides remain unchanged.
- An existing automatic profile that still stores 13% under the old rule is updated naturally when its next customer consumption is recorded. No data migration or read-path rewrite is added.

## Implementation Scope

- Change the tier-three threshold from `1000 * common.QuotaPerUnit` to `10000 * common.QuotaPerUnit`.
- Update the agent administration description to show the 10,000-unit threshold.
- Update translations used by that description.
- Revise the agent commission tier test to cover the 100, 1,000, and 10,000 boundaries without creating an oversized single consumption record.

## Verification

- Run the focused Go model tests for agent commission tiers.
- Run the full relevant Go package tests.
- Run the frontend production build after the copy change.
- Confirm the Git diff contains no migration or unrelated agent logic changes.
