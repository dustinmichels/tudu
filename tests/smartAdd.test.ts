import { describe, expect, it } from "bun:test";
import {
	detectSmartToken,
	getContextSuggestions,
	getDueSuggestions,
	getPrioritySuggestions,
	getTagAndListSuggestions,
	parseSmartAdd,
	resolveRelativeDueDate,
} from "../src/utils/smartAdd.ts";

describe("Smart Add Parser and Helpers", () => {
	const fixedBase = new Date(2026, 8, 10); // Thursday, Sept 10, 2026

	describe("resolveRelativeDueDate", () => {
		it("resolves today", () => {
			expect(resolveRelativeDueDate("today", fixedBase)).toBe("2026-09-10");
		});

		it("resolves tomorrow", () => {
			expect(resolveRelativeDueDate("tomorrow", fixedBase)).toBe("2026-09-11");
			expect(resolveRelativeDueDate("tom", fixedBase)).toBe("2026-09-11");
		});

		it("resolves relative days and weeks (+N)", () => {
			expect(resolveRelativeDueDate("+1d", fixedBase)).toBe("2026-09-11");
			expect(resolveRelativeDueDate("+3", fixedBase)).toBe("2026-09-13");
			expect(resolveRelativeDueDate("+1w", fixedBase)).toBe("2026-09-17");
			expect(resolveRelativeDueDate("1 week", fixedBase)).toBe("2026-09-17");
			expect(resolveRelativeDueDate("2 weeks", fixedBase)).toBe("2026-09-24");
		});

		it("resolves day names", () => {
			// Thursday -> Friday is +1
			expect(resolveRelativeDueDate("friday", fixedBase)).toBe("2026-09-11");
			expect(resolveRelativeDueDate("fri", fixedBase)).toBe("2026-09-11");
			// Thursday -> Monday is +4
			expect(resolveRelativeDueDate("monday", fixedBase)).toBe("2026-09-14");
			// Thursday -> next Friday is +8
			expect(resolveRelativeDueDate("next friday", fixedBase)).toBe("2026-09-18");
		});

		it("keeps valid ISO dates", () => {
			expect(resolveRelativeDueDate("2026-12-25", fixedBase)).toBe("2026-12-25");
		});
	});

	describe("detectSmartToken", () => {
		it("detects # token at end of input", () => {
			const token = detectSmartToken("Buy groceries #gro", 18);
			expect(token).toEqual({
				prefix: "#",
				query: "gro",
				startIndex: 14,
				endIndex: 18,
			});
		});

		it("detects bare prefix at start of input", () => {
			const token = detectSmartToken("#", 1);
			expect(token).toEqual({
				prefix: "#",
				query: "",
				startIndex: 0,
				endIndex: 1,
			});
		});

		it("detects ^ due date token mid typing", () => {
			const token = detectSmartToken("Call mom ^tom", 13);
			expect(token).toEqual({
				prefix: "^",
				query: "tom",
				startIndex: 9,
				endIndex: 13,
			});
		});

		it("detects ! priority token", () => {
			const token = detectSmartToken("Urgent fix !1", 13);
			expect(token).toEqual({
				prefix: "!",
				query: "1",
				startIndex: 11,
				endIndex: 13,
			});
		});

		it("detects @ context token at end of input", () => {
			const token = detectSmartToken("Fix leaky faucet @hom", 21);
			expect(token).toEqual({
				prefix: "@",
				query: "hom",
				startIndex: 17,
				endIndex: 21,
			});
		});

		it("detects bare @ at start of input", () => {
			const token = detectSmartToken("@", 1);
			expect(token).toEqual({
				prefix: "@",
				query: "",
				startIndex: 0,
				endIndex: 1,
			});
		});

		it("ignores # inside a word like C# or foo#bar", () => {
			expect(detectSmartToken("Learn C#", 8)).toBeNull();
			expect(detectSmartToken("foo#bar", 7)).toBeNull();
		});

		it("returns null when typing regular text", () => {
			expect(detectSmartToken("Buy groceries", 13)).toBeNull();
		});
	});

	describe("suggestions generation", () => {
		it("suggests due dates matching query", () => {
			const suggestions = getDueSuggestions("tom", fixedBase);
			expect(suggestions.length).toBeGreaterThan(0);
			expect(suggestions[0]?.insertValue).toBe("tomorrow");
		});

		it("suggests priorities", () => {
			const suggestions = getPrioritySuggestions("1");
			expect(suggestions.some((s) => s.insertValue === "1")).toBe(true);
		});

		it("suggests matching tags and lists", () => {
			const tags = ["errands", "work", "urgent"];
			const lists = ["Inbox", "Personal", "Work"];
			const suggestions = getTagAndListSuggestions(tags, lists, "work");

			expect(suggestions.some((s) => s.type === "list" && s.label === "Work")).toBe(true);
			expect(suggestions.some((s) => s.type === "tag" && s.label === "work")).toBe(true);
		});

		it("suggests new tag when no matches found", () => {
			const tags = ["groceries"];
			const lists = ["Inbox"];
			const suggestions = getTagAndListSuggestions(tags, lists, "finances");

			expect(suggestions.some((s) => s.label === "finances" && s.description === "New tag")).toBe(
				true,
			);
		});
	});

	describe("getContextSuggestions", () => {
		const gtdTags = ["@home", "@work", "@school", "@errands", "@computer", "@calls"];

		it("suggests matching context tags", () => {
			const suggestions = getContextSuggestions(gtdTags, "calls");
			expect(suggestions.length).toBe(1);
			expect(suggestions[0].label).toBe("@calls");
			expect(suggestions[0].insertValue).toBe("calls");
			expect(suggestions[0].badge).toBe("@calls");
			expect(suggestions[0].type).toBe("context");
		});

		it("suggests both partial match and new context option when query is partial", () => {
			const suggestions = getContextSuggestions(gtdTags, "call");
			expect(suggestions.length).toBe(2);
			expect(suggestions[0].label).toBe("@calls");
			expect(suggestions[1].label).toBe("@call");
			expect(suggestions[1].description).toBe("New context");
		});

		it("suggests all context tags when query is empty", () => {
			const suggestions = getContextSuggestions(gtdTags, "");
			expect(suggestions.length).toBe(6);
		});

		it("suggests creating a new context when query has no match", () => {
			const suggestions = getContextSuggestions(gtdTags, "deep work");
			expect(suggestions.some((s) => s.label === "@deep work")).toBe(true);
			const newContext = suggestions.find((s) => s.label === "@deep work");
			expect(newContext?.insertValue).toBe('"deep work"');
		});
	});

	describe("parseSmartAdd", () => {
		it("parses full smart add command", () => {
			const parsed = parseSmartAdd(
				"Review quarterly report #Work #finance ^tomorrow !1",
				["Work", "Personal"],
				fixedBase,
			);

			expect(parsed.title).toBe("Review quarterly report");
			expect(parsed.listName).toBe("Work");
			expect(parsed.tags).toEqual(["finance"]);
			expect(parsed.due).toBe("2026-09-11");
			expect(parsed.priority).toBe(1);
		});

		it("handles multiple tags and quoted names with spaces", () => {
			const parsed = parseSmartAdd('Pay taxes #"tax return" ^"next friday" !2', [], fixedBase);

			expect(parsed.title).toBe("Pay taxes");
			expect(parsed.tags).toEqual(["tax return"]);
			expect(parsed.due).toBe("2026-09-18");
			expect(parsed.priority).toBe(2);
		});

		it("handles title with no shortcuts intact", () => {
			const parsed = parseSmartAdd("Simple clean task without shortcuts");
			expect(parsed.title).toBe("Simple clean task without shortcuts");
			expect(parsed.tags).toEqual([]);
			expect(parsed.due).toBeUndefined();
			expect(parsed.priority).toBeUndefined();
			expect(parsed.listName).toBeUndefined();
		});

		it("cleans tokens whether at the beginning, middle, or end", () => {
			const parsed = parseSmartAdd("!1 ^today Buy milk #groceries at store", [], fixedBase);
			expect(parsed.title).toBe("Buy milk at store");
			expect(parsed.priority).toBe(1);
			expect(parsed.due).toBe("2026-09-10");
			expect(parsed.tags).toEqual(["groceries"]);
		});

		it("does not strip unrecognized tokens from title", () => {
			const parsed = parseSmartAdd(
				"Read this !not urgent task with ^v2.0 release #validTag",
				[],
				fixedBase,
			);
			expect(parsed.title).toBe("Read this !not urgent task with ^v2.0 release");
			expect(parsed.tags).toEqual(["validTag"]);
			expect(parsed.due).toBeUndefined();
			expect(parsed.priority).toBeUndefined();
		});

		it("handles !none and !0 priority tokens by stripping them and leaving priority undefined", () => {
			const parsed = parseSmartAdd("Task with !none priority", [], fixedBase);
			expect(parsed.title).toBe("Task with priority");
			expect(parsed.priority).toBeUndefined();
		});

		it("parses @context tokens into tags with leading @", () => {
			const parsed = parseSmartAdd("Fix leaky kitchen faucet @home ^today !2", [], fixedBase);
			expect(parsed.title).toBe("Fix leaky kitchen faucet");
			expect(parsed.tags).toEqual(["@home"]);
			expect(parsed.due).toBe("2026-09-10");
			expect(parsed.priority).toBe(2);
		});

		it("handles multiple contexts and mixed #tags and @contexts", () => {
			const parsed = parseSmartAdd("Write report @work @computer #q3-goals", ["Work"], fixedBase);
			expect(parsed.title).toBe("Write report");
			expect(parsed.tags).toContain("@work");
			expect(parsed.tags).toContain("@computer");
			expect(parsed.tags).toContain("q3-goals");
		});

		it("handles quoted context names with spaces", () => {
			const parsed = parseSmartAdd('Refactor auth module @"deep focus" ^tomorrow', [], fixedBase);
			expect(parsed.title).toBe("Refactor auth module");
			expect(parsed.tags).toEqual(["@deep focus"]);
			expect(parsed.due).toBe("2026-09-11");
		});
	});
});
