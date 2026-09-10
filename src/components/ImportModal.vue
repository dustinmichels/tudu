<script setup lang="ts">
import {
	AlertCircle,
	CheckCircle2,
	FileUp,
	Loader2,
	Upload,
	X,
} from "lucide-vue-next";
import { ref } from "vue";
import { api } from "../services/api.ts";
import { mapRememberTheMilkToOpenTask } from "../services/rememberTheMilk.ts";
import { useListStore } from "../stores/lists.ts";
import { useTagStore } from "../stores/tags.ts";
import { useTaskStore } from "../stores/tasks.ts";
import { useUIStore } from "../stores/ui.ts";

const uiStore = useUIStore();
const listStore = useListStore();
const taskStore = useTaskStore();
const tagStore = useTagStore();

type ProviderId = "rtm" | "todoist";

interface ProviderOption {
	id: ProviderId;
	name: string;
	description: string;
	enabled: boolean;
	badge?: string;
}

const providers: ProviderOption[] = [
	{
		id: "rtm",
		name: "Remember the Milk",
		description:
			"Import lists, tasks, notes, priorities, tags, and reminders from RTM JSON export.",
		enabled: true,
	},
	{
		id: "todoist",
		name: "Todoist",
		description:
			"Direct sync and project import from Todoist API or CSV/JSON export.",
		enabled: false,
		badge: "Coming soon",
	},
];

const selectedProvider = ref<ProviderId>("rtm");
const fileInputRef = ref<HTMLInputElement | null>(null);
const isImporting = ref(false);
const isDraggingOver = ref(false);
const dragCounter = ref(0);
const errorMessage = ref<string | null>(null);
const successMessage = ref<string | null>(null);
function handleSelectProvider(provider: ProviderOption) {
	if (!provider.enabled) return;
	selectedProvider.value = provider.id;
	errorMessage.value = null;
	successMessage.value = null;
}

function handleTriggerFileInput() {
	errorMessage.value = null;
	successMessage.value = null;
	fileInputRef.value?.click();
}

async function processFile(file: File) {
	if (
		!file.name.toLowerCase().endsWith(".json") &&
		file.type &&
		!file.type.includes("json")
	) {
		errorMessage.value = "Please upload a valid .json file.";
		return;
	}

	isImporting.value = true;
	errorMessage.value = null;
	successMessage.value = null;

	try {
		const text = await file.text();
		const parsedJson = JSON.parse(text);

		if (selectedProvider.value !== "rtm") {
			throw new Error("Provider not yet implemented.");
		}
		const openTaskDoc = mapRememberTheMilkToOpenTask(parsedJson);

		const result = await api.backup.import(openTaskDoc);

		successMessage.value = `Successfully imported ${result.tasks_imported} tasks across ${result.lists_imported} lists!`;

		// Refresh application stores
		await Promise.all([
			listStore.fetchLists(),
			taskStore.fetchAllTasks(),
			tagStore.fetchTags(),
		]);

		if (listStore.activeListId) {
			await taskStore.fetchTasks(listStore.activeListId);
		}
	} catch (err: unknown) {
		errorMessage.value =
			err instanceof Error
				? err.message
				: "Failed to import tasks. Please check the JSON format.";
	} finally {
		isImporting.value = false;
		if (fileInputRef.value) {
			fileInputRef.value.value = "";
		}
	}
}

async function handleFileSelected(event: Event) {
	const input = event.target as HTMLInputElement;
	const file = input.files?.[0];
	if (!file) return;
	await processFile(file);
}

function handleDragEnter(event: DragEvent) {
	event.preventDefault();
	dragCounter.value++;
	isDraggingOver.value = true;
}

function handleDragOver(event: DragEvent) {
	event.preventDefault();
	if (event.dataTransfer) {
		event.dataTransfer.dropEffect = "copy";
	}
	isDraggingOver.value = true;
}

function handleDragLeave(event: DragEvent) {
	event.preventDefault();
	dragCounter.value--;
	if (dragCounter.value <= 0) {
		dragCounter.value = 0;
		isDraggingOver.value = false;
	}
}

async function handleDrop(event: DragEvent) {
	event.preventDefault();
	dragCounter.value = 0;
	isDraggingOver.value = false;

	const file = event.dataTransfer?.files?.[0];
	if (!file) return;

	await processFile(file);
}

function closeModal() {
	uiStore.toggleImport(false);
	errorMessage.value = null;
	successMessage.value = null;
}
</script>

<template>
  <div
    v-if="uiStore.isImportOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
    role="dialog"
    aria-modal="true"
    aria-labelledby="import-modal-title"
    @dragover.prevent
    @drop.prevent
  >
    <div
      class="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
        <div class="flex items-center gap-2.5">
          <FileUp class="w-5 h-5 text-emerald-500" />
          <h2 id="import-modal-title" class="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Import Tasks
          </h2>
        </div>
        <button
          type="button"
          @click="closeModal"
          class="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          title="Close modal"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Body -->
      <div class="p-5 space-y-4 overflow-y-auto">
        <div>
          <label class="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
            Select Provider
          </label>
          <div class="space-y-2">
            <button
              v-for="provider in providers"
              :key="provider.id"
              type="button"
              :disabled="!provider.enabled"
              @click="handleSelectProvider(provider)"
              class="w-full text-left p-3.5 rounded-lg border transition-all flex items-start justify-between gap-3"
              :class="[
                provider.enabled
                  ? selectedProvider === provider.id
                    ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 text-zinc-900 dark:text-zinc-100 cursor-pointer ring-1 ring-emerald-500/50'
                    : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 hover:bg-zinc-100/80 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 cursor-pointer'
                  : 'border-zinc-200/60 dark:border-zinc-800/60 bg-zinc-100/50 dark:bg-zinc-900/50 text-zinc-400 dark:text-zinc-500 cursor-not-allowed opacity-60'
              ]"
            >
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <span class="font-medium text-sm">{{ provider.name }}</span>
                  <span
                    v-if="provider.badge"
                    class="px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                  >
                    {{ provider.badge }}
                  </span>
                </div>
                <p class="text-xs mt-0.5 text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  {{ provider.description }}
                </p>
              </div>
              <div
                v-if="provider.enabled"
                class="w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5"
                :class="selectedProvider === provider.id ? 'border-emerald-500 bg-emerald-500' : 'border-zinc-300 dark:border-zinc-600'"
              >
                <div
                  v-if="selectedProvider === provider.id"
                  class="w-1.5 h-1.5 bg-white rounded-full"
                />
              </div>
            </button>
          </div>
        </div>

        <!-- Hidden file input -->
        <input
          ref="fileInputRef"
          type="file"
          accept=".json"
          class="hidden"
          @change="handleFileSelected"
        />

        <!-- Action / File Upload Area -->
        <div class="pt-2">
          <div
            @click="handleTriggerFileInput"
            @dragenter.prevent="handleDragEnter"
            @dragover.prevent="handleDragOver"
            @dragleave.prevent="handleDragLeave"
            @drop.prevent="handleDrop"
            :class="[
              'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2',
              isDraggingOver
                ? 'border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/40 ring-2 ring-emerald-500/40 scale-[1.01]'
                : 'border-zinc-300 dark:border-zinc-700 hover:border-emerald-500 dark:hover:border-emerald-500 bg-zinc-50/50 dark:bg-zinc-900/50 hover:bg-emerald-50/20 dark:hover:bg-emerald-950/10'
            ]"
          >
            <div
              :class="[
                'p-3 rounded-full transition-colors',
                isDraggingOver
                  ? 'bg-emerald-200 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300'
                  : 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400'
              ]"
            >
              <Upload class="w-6 h-6" />
            </div>
            <div>
              <p class="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                {{ isDraggingOver ? 'Drop Remember the Milk JSON file here' : 'Click to upload or drag & drop Remember the Milk JSON file' }}
              </p>
              <p class="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Compatible with RTM raw JSON backups or OpenTask-aligned exports
              </p>
            </div>
          </div>
        </div>

        <!-- Status banners -->
        <div
          v-if="isImporting"
          class="p-3 bg-zinc-100 dark:bg-zinc-800 rounded-lg flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300 text-xs"
        >
          <Loader2 class="w-4 h-4 animate-spin text-emerald-500 shrink-0" />
          <span>Importing data and aligning with OpenTask format...</span>
        </div>

        <div
          v-if="errorMessage"
          class="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-lg flex items-start gap-2.5 text-rose-700 dark:text-rose-400 text-xs"
        >
          <AlertCircle class="w-4 h-4 shrink-0 mt-0.5" />
          <span class="leading-relaxed">{{ errorMessage }}</span>
        </div>

        <div
          v-if="successMessage"
          class="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 rounded-lg flex items-start gap-2.5 text-emerald-700 dark:text-emerald-400 text-xs"
        >
          <CheckCircle2 class="w-4 h-4 shrink-0 mt-0.5" />
          <span class="leading-relaxed">{{ successMessage }}</span>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 flex items-center justify-end gap-2">
        <button
          type="button"
          @click="closeModal"
          class="px-3.5 py-1.5 text-xs font-medium rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
        >
          Close
        </button>
      </div>
    </div>
  </div>
</template>
