I want to create a new, personal todo list app called TuDu, modeled after Remember The Milk (RTM).

Some screenshots of RTM are attached in screenshots folder.

Key features:

- Tasks can be organized by custom tags, lists, or due date.
- If you click on a list you see complete and incomplete tasks.
- If you click on a task you see detail view.
  - Properties: due, repeats, list, tags, location, url, notes
  - Subtasks: (which can have all the same properties)

Tasks also have a priority level. They can be marked as "done" or "posted by 1 day, 2 days, 1 week".

## Implementation

- Build the app using tauri, with a frontend made using bun, vue, typescript.
- Focus on desktop app first (macbook) but be prepared to expand into mobile, android, etc.
- Use turso for the database. Focus on local for now, but we will eventually need to sync computer and phone, eg with turso cloud free tier.
