import type { Priority } from "../models/index.ts";

export interface ParsedSmartAdd {
	title: string;
	listName?: string;
	tags: string[];
	due?: string; // YYYY-MM-DD
	priority?: Priority;
}

export type SmartShortcutPrefix = "#" | "^" | "!";

export interface SmartSuggestion {
	type: "tag" | "list" | "due" | "priority";
	label: string;
	description?: string;
	insertValue: string; // The token to insert, e.g. "Work", "today", "1"
	badge?: string;
}

export interface ActiveSmartToken {
	prefix: SmartShortcutPrefix;
	query: string;
	startIndex: number; // Index of the prefix character in input
	endIndex: number; // Current cursor index
}

/**
 * Format a Date object into local YYYY-MM-DD string
 */
export function formatDateIso(d: Date): string {
	const year = d.getFullYear();
	const month = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

/**
 * Resolve relative date keywords to YYYY-MM-DD
 */
export function resolveRelativeDueDate(
	raw: string,
	baseDate: Date = new Date(),
): string | null {
	const cleaned = raw
		.trim()
		.toLowerCase()
		.replace(/^['"]|['"]$/g, "");
	if (!cleaned) return null;

	// Exact ISO format YYYY-MM-DD
	if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
		return cleaned;
	}

	const d = new Date(baseDate.getTime());

	if (cleaned === "today") {
		return formatDateIso(d);
	}
	if (cleaned === "tomorrow" || cleaned === "tom") {
		d.setDate(d.getDate() + 1);
		return formatDateIso(d);
	}
	if (cleaned === "yesterday") {
		d.setDate(d.getDate() - 1);
		return formatDateIso(d);
	}

	// "+N" or "+Nd" or "+Nw" or "+Nm"
	const plusMatch = /^\+(\d+)([dwm]?)$/.exec(cleaned);
	if (plusMatch?.[1]) {
		const count = Number.parseInt(plusMatch[1], 10);
		const unit = plusMatch[2] || "d";
		if (unit === "d") d.setDate(d.getDate() + count);
		else if (unit === "w") d.setDate(d.getDate() + count * 7);
		else if (unit === "m") d.setMonth(d.getMonth() + count);
		return formatDateIso(d);
	}

	// "1 week" / "2 weeks" / "1 day" / "3 days"
	const relativeWordsMatch = /^(\d+)\s*(days?|weeks?|months?)$/.exec(cleaned);
	if (relativeWordsMatch?.[1] && relativeWordsMatch[2]) {
		const count = Number.parseInt(relativeWordsMatch[1], 10);
		const unit = relativeWordsMatch[2];
		if (unit.startsWith("day")) d.setDate(d.getDate() + count);
		else if (unit.startsWith("week")) d.setDate(d.getDate() + count * 7);
		else if (unit.startsWith("month")) d.setMonth(d.getMonth() + count);
		return formatDateIso(d);
	}

	// Day of week (e.g., "monday", "mon", "next friday")
	const daysMap: Record<string, number> = {
		sun: 0,
		sunday: 0,
		mon: 1,
		monday: 1,
		tue: 2,
		tues: 2,
		tuesday: 2,
		wed: 3,
		wednesday: 3,
		thu: 4,
		thur: 4,
		thurs: 4,
		thursday: 4,
		fri: 5,
		friday: 5,
		sat: 6,
		saturday: 6,
	};

	let isNextWeek = false;
	let dayQuery = cleaned;
	if (cleaned.startsWith("next ")) {
		isNextWeek = true;
		dayQuery = cleaned.slice(5).trim();
	}

	if (dayQuery in daysMap) {
		const targetDay = daysMap[dayQuery];
		if (targetDay !== undefined) {
			const currentDay = d.getDay();
			let diff = targetDay - currentDay;
			if (diff <= 0) {
				diff += 7;
			}
			if (isNextWeek) {
				diff += 7;
			}
			d.setDate(d.getDate() + diff);
			return formatDateIso(d);
		}
	}

	return null;
}

/**
 * Detect if cursor is currently inside a smart shortcut token (#tag, ^due, !priority).
 */
export function detectSmartToken(
	text: string,
	cursorPos: number,
): ActiveSmartToken | null {
	if (cursorPos < 0 || cursorPos > text.length) return null;

	const textBeforeCursor = text.slice(0, cursorPos);
	// Search backwards from cursor position to find the nearest prefix #, ^, or !
	// A token must start at start of line or immediately after whitespace.
	const tokenMatch = /(?:^|\s)([#^!])([^\s]*)$/.exec(textBeforeCursor);
	if (!tokenMatch?.[1]) return null;

	const prefix = tokenMatch[1] as SmartShortcutPrefix;
	const query = tokenMatch[2] ?? "";
	const startIndex = textBeforeCursor.length - query.length - 1;

	return {
		prefix,
		query,
		startIndex,
		endIndex: cursorPos,
	};
}

/**
 * Standard suggestions for Due Date (^)
 */
export function getDueSuggestions(
	query = "",
	baseDate: Date = new Date(),
): SmartSuggestion[] {
	const items: SmartSuggestion[] = [
		{
			type: "due",
			label: "Today",
			description: formatDateIso(baseDate),
			insertValue: "today",
			badge: "^today",
		},
		{
			type: "due",
			label: "Tomorrow",
			description: (() => {
				const d = new Date(baseDate.getTime());
				d.setDate(d.getDate() + 1);
				return formatDateIso(d);
			})(),
			insertValue: "tomorrow",
			badge: "^tomorrow",
		},
		{
			type: "due",
			label: "1 week",
			description: (() => {
				const d = new Date(baseDate.getTime());
				d.setDate(d.getDate() + 7);
				return formatDateIso(d);
			})(),
			insertValue: "+1w",
			badge: "^+1w",
		},
		{
			type: "due",
			label: "Next Monday",
			insertValue: "next monday",
			badge: "^next monday",
		},
		{
			type: "due",
			label: "Next Friday",
			insertValue: "next friday",
			badge: "^next friday",
		},
	];

	const q = query.trim().toLowerCase();
	if (!q) return items;

	const filtered = items.filter(
		(item) =>
			item.label.toLowerCase().includes(q) ||
			item.insertValue.toLowerCase().includes(q) ||
			item.description?.toLowerCase().includes(q),
	);

	// If user is typing something custom like "2026-09-15" or "+3d" that isn't in predefined list, allow it
	if (filtered.length === 0 && q.length > 0) {
		const resolved = resolveRelativeDueDate(q, baseDate);
		filtered.push({
			type: "due",
			label: q,
			description: resolved ?? "Custom date",
			insertValue: q,
			badge: `^${q}`,
		});
	}

	return filtered;
}

/**
 * Standard suggestions for Priority (!)
 */
export function getPrioritySuggestions(query = ""): SmartSuggestion[] {
	const items: SmartSuggestion[] = [
		{
			type: "priority",
			label: "Priority 1 (High)",
			description: "Urgent",
			insertValue: "1",
			badge: "!1",
		},
		{
			type: "priority",
			label: "Priority 2 (Medium)",
			description: "Normal",
			insertValue: "2",
			badge: "!2",
		},
		{
			type: "priority",
			label: "Priority 3 (Low)",
			description: "Minor",
			insertValue: "3",
			badge: "!3",
		},
		{
			type: "priority",
			label: "None",
			description: "No priority",
			insertValue: "none",
			badge: "!none",
		},
	];

	const q = query.trim().toLowerCase();
	if (!q) return items;

	return items.filter(
		(item) =>
			item.label.toLowerCase().includes(q) ||
			item.insertValue.toLowerCase().includes(q) ||
			item.description?.toLowerCase().includes(q),
	);
}

/**
 * Tag / List suggestions for (#)
 */
export function getTagAndListSuggestions(
	tags: string[],
	lists: string[],
	query = "",
): SmartSuggestion[] {
	const q = query.trim().toLowerCase();
	const suggestions: SmartSuggestion[] = [];

	// Add list suggestions first or mixed
	for (const listName of lists) {
		if (!q || listName.toLowerCase().includes(q)) {
			suggestions.push({
				type: "list",
				label: listName,
				description: "List",
				insertValue: listName.includes(" ") ? `"${listName}"` : listName,
				badge: `#${listName}`,
			});
		}
	}

	// Add tag suggestions
	for (const tag of tags) {
		if (!q || tag.toLowerCase().includes(q)) {
			// Avoid duplicate label if tag matches list name exactly
			const isAlsoList = lists.some(
				(l) => l.toLowerCase() === tag.toLowerCase(),
			);
			suggestions.push({
				type: "tag",
				label: tag,
				description: isAlsoList ? "Tag" : undefined,
				insertValue: tag.includes(" ") ? `"${tag}"` : tag,
				badge: `#${tag}`,
			});
		}
	}

	// If query doesn't match any existing tag or list, suggest creating a new tag
	if (
		q &&
		!tags.some((t) => t.toLowerCase() === q) &&
		!lists.some((l) => l.toLowerCase() === q)
	) {
		const cleanQuery = query.trim();
		suggestions.push({
			type: "tag",
			label: cleanQuery,
			description: "New tag",
			insertValue: cleanQuery.includes(" ") ? `"${cleanQuery}"` : cleanQuery,
			badge: `#${cleanQuery}`,
		});
	}

	return suggestions;
}

/**
 * Parse a full input string containing RTM Smart Add shortcuts:
 * - #tag or #"tag with spaces"
 * - ^today, ^tomorrow, ^+1w, ^"2026-09-12"
 * - !1, !2, !3, !none
 *
 * Known list names can be passed so #list matches list_id instead of tag if desired.
 */
export function parseSmartAdd(
	rawInput: string,
	knownListNames: string[] = [],
	baseDate: Date = new Date(),
): ParsedSmartAdd {
	const tags: string[] = [];
	let listName: string | undefined;
	let due: string | undefined;
	let priority: Priority | undefined;

	// Pattern matches shortcuts with optional quotes:
	// (#|!|\^)(?:"([^"]+)"|'([^']+)'|([^\s]+))
	// Group 1: prefix (#, !, ^)
	// Group 2: double-quoted value
	// Group 3: single-quoted value
	// Group 4: unquoted value
	const regex = /(?:^|\s)([#!^])(?:"([^"]+)"|'([^']+)'|([^\s]+))/g;

	let cleanedTitle = rawInput;

	// We collect all matches and their indices
	const matches: Array<{
		fullMatch: string;
		prefix: string;
		value: string;
		index: number;
	}> = [];

	let m: RegExpExecArray | null;
	// biome-ignore lint/suspicious/noAssignInExpressions: regex exec loop
	while ((m = regex.exec(rawInput)) !== null) {
		const prefix = m[1];
		const value = m[2] || m[3] || m[4];
		if (prefix && value) {
			matches.push({
				fullMatch: m[0],
				prefix,
				value,
				index: m.index,
			});
		}
	}

	for (const match of matches) {
		const { prefix, value } = match;
		if (prefix === "#") {
			// Check if this matches a known list name (case-insensitive)
			const matchedList = knownListNames.find(
				(l) => l.toLowerCase() === value.toLowerCase(),
			);
			if (matchedList && !listName) {
				listName = matchedList;
			} else {
				if (!tags.includes(value)) {
					tags.push(value);
				}
			}
		} else if (prefix === "^") {
			const resolvedDate = resolveRelativeDueDate(value, baseDate);
			if (resolvedDate) {
				due = resolvedDate;
			}
		} else if (prefix === "!") {
			const p = value.toLowerCase();
			if (p === "1" || p === "high" || p === "urgent") priority = 1;
			else if (p === "2" || p === "med" || p === "medium" || p === "normal")
				priority = 2;
			else if (p === "3" || p === "low") priority = 3;
		}
	}

	// Strip the matched tokens from the title
	// Replace matches in reverse order to keep string indices intact
	for (let i = matches.length - 1; i >= 0; i--) {
		const match = matches[i];
		if (match) {
			cleanedTitle =
				cleanedTitle.slice(0, match.index) +
				cleanedTitle.slice(match.index + match.fullMatch.length);
		}
	}

	// Clean up extra whitespace
	cleanedTitle = cleanedTitle.replace(/\s+/g, " ").trim();

	return {
		title: cleanedTitle,
		listName,
		tags,
		due,
		priority,
	};
}
