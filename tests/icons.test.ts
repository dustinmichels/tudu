import { describe, expect, test } from "bun:test";
import { DEFAULT_LIST_ICON, getListIcon, LIST_ICONS } from "../src/utils/icons.ts";
import { List, ShoppingCart, Briefcase } from "lucide-vue-next";

describe("List Icon Registry", () => {
	test("defaults to List icon when null or undefined is passed", () => {
		expect(getListIcon(null)).toBe(List);
		expect(getListIcon(undefined)).toBe(List);
		expect(getListIcon("")).toBe(List);
	});

	test("returns matching component for known icon names", () => {
		expect(getListIcon("List")).toBe(List);
		expect(getListIcon("ShoppingCart")).toBe(ShoppingCart);
		expect(getListIcon("Briefcase")).toBe(Briefcase);
	});

	test("resolves icon names case-insensitively", () => {
		expect(getListIcon("shoppingcart")).toBe(ShoppingCart);
		expect(getListIcon("BRIEFCASE")).toBe(Briefcase);
		expect(getListIcon("list")).toBe(List);
	});

	test("falls back to List for unknown icon names", () => {
		expect(getListIcon("NonExistentIconXYZ")).toBe(List);
	});

	test("curated icon set contains expected icons with labels", () => {
		expect(LIST_ICONS.length).toBeGreaterThanOrEqual(20);
		expect(DEFAULT_LIST_ICON).toBe("List");

		const names = LIST_ICONS.map((i) => i.name);
		expect(names).toContain("List");
		expect(names).toContain("Folder");
		expect(names).toContain("ShoppingCart");
		expect(names).toContain("Briefcase");
		expect(names).toContain("House");
		expect(names).toContain("Code");
	});
});
