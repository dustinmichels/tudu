use serde::{Deserialize, Deserializer, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct List {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub position: i64,
    #[serde(default)]
    pub is_archived: bool,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub extra: Option<serde_json::Value>,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Task {
    pub id: String,
    pub uid: Option<String>,
    pub parent_id: Option<String>,
    pub list_id: String,
    pub title: String,
    pub description: Option<String>,
    pub due: Option<String>,
    pub is_all_day: bool,
    pub rrule: Option<String>,
    pub priority: Option<i64>,
    pub location: Option<String>,
    pub url: Option<String>,
    pub completed: bool,
    pub completed_at: Option<String>,
    #[serde(default = "default_status")]
    pub status: String,
    #[serde(default)]
    pub start: Option<String>,
    #[serde(default)]
    pub duration: Option<String>,
    #[serde(default)]
    pub timezone: Option<String>,
    #[serde(default)]
    pub percent_complete: i64,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub position: i64,
    #[serde(default)]
    pub geo_latitude: Option<f64>,
    #[serde(default)]
    pub geo_longitude: Option<f64>,
    #[serde(default)]
    pub extra: Option<serde_json::Value>,
    #[serde(default)]
    pub tags: Vec<Tag>,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

fn default_status() -> String {
    "needs_action".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GeoLocation {
    pub latitude: f64,
    pub longitude: f64,
}

pub fn double_option<'de, T, D>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    T: Deserialize<'de>,
    D: Deserializer<'de>,
{
    Deserialize::deserialize(deserializer).map(Some)
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UpdateTaskInput {
    pub id: String,
    #[serde(default, deserialize_with = "double_option")]
    pub uid: Option<Option<String>>,
    #[serde(default, alias = "parentId", deserialize_with = "double_option")]
    pub parent_id: Option<Option<String>>,
    #[serde(default, alias = "listId")]
    pub list_id: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default, deserialize_with = "double_option")]
    pub description: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub due: Option<Option<String>>,
    #[serde(default, alias = "isAllDay")]
    pub is_all_day: Option<bool>,
    #[serde(default, alias = "repeats", deserialize_with = "double_option")]
    pub rrule: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub priority: Option<Option<i64>>,
    #[serde(default, deserialize_with = "double_option")]
    pub location: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub url: Option<Option<String>>,
    #[serde(default)]
    pub completed: Option<bool>,
    #[serde(default, alias = "completedAt", deserialize_with = "double_option")]
    pub completed_at: Option<Option<String>>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default, deserialize_with = "double_option")]
    pub start: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub duration: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub timezone: Option<Option<String>>,
    #[serde(default, alias = "percentComplete")]
    pub percent_complete: Option<i64>,
    #[serde(default, deserialize_with = "double_option")]
    pub color: Option<Option<String>>,
    #[serde(default)]
    pub position: Option<i64>,
    #[serde(default, alias = "geoLatitude", deserialize_with = "double_option")]
    pub geo_latitude: Option<Option<f64>>,
    #[serde(default, alias = "geoLongitude", deserialize_with = "double_option")]
    pub geo_longitude: Option<Option<f64>>,
    #[serde(default, deserialize_with = "double_option")]
    pub geo: Option<Option<GeoLocation>>,
    #[serde(default, deserialize_with = "double_option")]
    pub extra: Option<Option<serde_json::Value>>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
    #[serde(default, deserialize_with = "double_option")]
    pub deleted_at: Option<Option<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TagWithCount {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
    pub task_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Note {
    pub id: String,
    pub task_id: String,
    pub title: Option<String>,
    pub content: String,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Reminder {
    pub id: String,
    pub task_id: String,
    pub trigger: String,
    pub relative_to: String,
    pub action: String,
    #[serde(default)]
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TaskDetail {
    #[serde(flatten)]
    pub task: Task,
    pub notes: Vec<Note>,
    pub subtasks: Vec<Task>,
}

impl std::ops::Deref for TaskDetail {
    type Target = Task;
    fn deref(&self) -> &Self::Target {
        &self.task
    }
}

impl std::ops::DerefMut for TaskDetail {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.task
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct BatchUpdateTasksInput {
    pub task_ids: Vec<String>,
    pub completed: Option<bool>,
    pub postpone_days: Option<i64>,
    pub due: Option<String>,
    pub list_id: Option<String>,
    #[serde(default, deserialize_with = "double_option")]
    pub priority: Option<Option<i64>>,
}
// ---------------------------------------------------------------------------
// OpenTask v1.0 Interchange Specification Types (matching opentask-v1.json)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct OpenTaskChecklistItem {
    pub id: String,
    pub title: String,
    pub completed: bool,
    #[serde(default)]
    pub position: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct OpenTaskReminder {
    pub id: String,
    pub trigger: String,
    #[serde(default = "default_relative_to")]
    pub relative_to: String,
    #[serde(default = "default_action")]
    pub action: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

fn default_relative_to() -> String {
    "due".to_string()
}

fn default_action() -> String {
    "display".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct OpenTaskNote {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub content: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct OpenTaskTag {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct OpenTaskTaskList {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default)]
    pub position: i64,
    #[serde(default)]
    pub is_archived: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub extra: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct OpenTaskTask {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uid: Option<String>,
    pub list_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub notes: Vec<OpenTaskNote>,
    #[serde(default = "default_status")]
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub due: Option<String>,
    #[serde(default)]
    pub is_all_day: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timezone: Option<String>,
    #[serde(default = "default_priority")]
    pub priority: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub priority_raw: Option<serde_json::Value>,
    #[serde(default)]
    pub percent_complete: i64,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rrule: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub repeats: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub location: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub geo: Option<GeoLocation>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(default)]
    pub position: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub checklist: Option<Vec<OpenTaskChecklistItem>>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub reminders: Vec<OpenTaskReminder>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub extra: Option<serde_json::Value>,
}

fn default_priority() -> String {
    "none".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct OpenTaskDocument {
    pub version: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exported_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    pub lists: Vec<OpenTaskTaskList>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<OpenTaskTag>>,
    pub tasks: Vec<OpenTaskTask>,
}

// ---------------------------------------------------------------------------
// Conversion Utilities between TuDu domain models and OpenTask
// ---------------------------------------------------------------------------

pub fn priority_to_opentask(p: Option<i64>) -> String {
    match p {
        Some(1) => "high".to_string(),
        Some(2) => "medium".to_string(),
        Some(3) => "low".to_string(),
        _ => "none".to_string(),
    }
}

pub fn opentask_to_priority(priority: &str, priority_raw: Option<&serde_json::Value>) -> Option<i64> {
    if let Some(raw) = priority_raw {
        if let Some(n) = raw.as_i64() {
            if (1..=3).contains(&n) {
                return Some(n);
            }
        }
    }
    match priority.to_ascii_lowercase().as_str() {
        "high" => Some(1),
        "medium" => Some(2),
        "low" => Some(3),
        _ => None,
    }
}

pub fn status_to_completed(status: &str) -> bool {
    status.eq_ignore_ascii_case("completed")
}

pub fn completed_to_status(completed: bool, current_status: Option<&str>) -> String {
    if completed {
        "completed".to_string()
    } else if let Some(s) = current_status {
        if s.eq_ignore_ascii_case("in_progress") {
            "in_progress".to_string()
        } else if s.eq_ignore_ascii_case("cancelled") {
            "cancelled".to_string()
        } else {
            "needs_action".to_string()
        }
    } else {
        "needs_action".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_batch_update_tasks_input_serde() {
        // 1. Omitted priority -> None
        let json_omitted = r#"{"task_ids": ["t1"]}"#;
        let parsed_omitted: BatchUpdateTasksInput =
            serde_json::from_str(json_omitted).expect("parse omitted priority");
        assert_eq!(parsed_omitted.priority, None);

        // 2. Explicit null -> Some(None) (clear priority / Priority None)
        let json_null = r#"{"task_ids": ["t1"], "priority": null}"#;
        let parsed_null: BatchUpdateTasksInput =
            serde_json::from_str(json_null).expect("parse null priority");
        assert_eq!(parsed_null.priority, Some(None));

        // 3. Concrete priority -> Some(Some(1))
        let json_priority = r#"{"task_ids": ["t1"], "priority": 1}"#;
        let parsed_priority: BatchUpdateTasksInput =
            serde_json::from_str(json_priority).expect("parse concrete priority");
        assert_eq!(parsed_priority.priority, Some(Some(1)));
    }

    #[test]
    fn test_update_task_input_serde() {
        // Test omitted nullable vs explicit null vs concrete value
        let json_data = r#"{
            "id": "t1",
            "title": "New Title",
            "due": null,
            "priority": 2,
            "parentId": null,
            "isAllDay": true,
            "geo": { "latitude": 37.77, "longitude": -122.41 },
            "percentComplete": 75
        }"#;
        let parsed: UpdateTaskInput = serde_json::from_str(json_data).expect("parse UpdateTaskInput");
        assert_eq!(parsed.id, "t1");
        assert_eq!(parsed.title, Some("New Title".to_string()));
        assert_eq!(parsed.due, Some(None)); // explicitly null
        assert_eq!(parsed.description, None); // omitted
        assert_eq!(parsed.priority, Some(Some(2))); // concrete value
        assert_eq!(parsed.parent_id, Some(None)); // alias parentId -> parent_id, explicitly null
        assert_eq!(parsed.is_all_day, Some(true)); // alias isAllDay -> is_all_day
        assert_eq!(parsed.percent_complete, Some(75)); // alias percentComplete
        assert_eq!(
            parsed.geo,
            Some(Some(GeoLocation {
                latitude: 37.77,
                longitude: -122.41,
            }))
        );
    }
}
