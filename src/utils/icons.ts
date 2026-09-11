import type { Component } from "vue";
import {
	BookOpen,
	Bookmark,
	Briefcase,
	Car,
	CheckSquare,
	Code,
	Coffee,
	DollarSign,
	Dumbbell,
	Film,
	Folder,
	GraduationCap,
	Heart,
	House,
	Lightbulb,
	List,
	ListTodo,
	Music,
	Plane,
	ShoppingCart,
	Smile,
	Sparkles,
	Star,
	Utensils,
} from "lucide-vue-next";

export interface IconOption {
	name: string;
	label: string;
	component: Component;
}

export const DEFAULT_LIST_ICON = "List";

export const LIST_ICONS: IconOption[] = [
	{ name: "List", label: "List", component: List },
	{ name: "ListTodo", label: "Tasks", component: ListTodo },
	{ name: "CheckSquare", label: "Checklist", component: CheckSquare },
	{ name: "Folder", label: "Folder", component: Folder },
	{ name: "Bookmark", label: "Bookmark", component: Bookmark },
	{ name: "Star", label: "Star", component: Star },
	{ name: "Heart", label: "Personal", component: Heart },
	{ name: "Sparkles", label: "Ideas", component: Sparkles },
	{ name: "Briefcase", label: "Work", component: Briefcase },
	{ name: "Code", label: "Coding", component: Code },
	{ name: "GraduationCap", label: "Study", component: GraduationCap },
	{ name: "BookOpen", label: "Reading", component: BookOpen },
	{ name: "Lightbulb", label: "Projects", component: Lightbulb },
	{ name: "House", label: "Home", component: House },
	{ name: "ShoppingCart", label: "Shopping", component: ShoppingCart },
	{ name: "Coffee", label: "Daily", component: Coffee },
	{ name: "Utensils", label: "Food", component: Utensils },
	{ name: "Dumbbell", label: "Fitness", component: Dumbbell },
	{ name: "Smile", label: "Hobbies", component: Smile },
	{ name: "Music", label: "Music", component: Music },
	{ name: "Film", label: "Movies", component: Film },
	{ name: "Plane", label: "Travel", component: Plane },
	{ name: "Car", label: "Errands", component: Car },
	{ name: "DollarSign", label: "Finances", component: DollarSign },
];

const ICON_MAP: Record<string, Component> = Object.fromEntries(
	LIST_ICONS.map((item) => [item.name.toLowerCase(), item.component]),
);

export function getListIcon(name?: string | null): Component {
	if (!name) return List;
	return ICON_MAP[name.toLowerCase()] ?? List;
}
