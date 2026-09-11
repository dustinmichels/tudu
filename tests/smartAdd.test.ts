import { describe, expect, it } from "bun:test";
import {
	detectSmartToken,
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
			expect(suggestions[0].insertValue).toBe("tomorrow");
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
	});
});
