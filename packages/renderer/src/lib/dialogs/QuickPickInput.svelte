<script lang="ts">
import { Button, Checkbox, Modal } from '@podman-desktop/ui-svelte';
import { onDestroy, onMount, tick } from 'svelte';

import Markdown from '/@/lib/markdown/Markdown.svelte';

import type { InputBoxOptions, QuickPickOptions } from './quickpick-input';

const ENTER = 'Enter';
const ESCAPE = 'Escape';
const DEFAULT_PROMPT = `Press '${ENTER}' to confirm your input or '${ESCAPE}' to cancel`;
let inputValue: string | undefined = '';
let placeHolder: string | undefined = '';
let prompt = '';
let markdownDescription: string | undefined = '';
let currentId = 0;
let title: string | undefined = '';
let multiline = false;

let validationEnabled = false;
let validationError: string | undefined = '';
let ignoreFocusOut = false;

let onSelectCallbackEnabled = false;

let display = false;
let mode: 'InputBox' | 'QuickPick';

type QuickPickItem = { value: string; description: string; detail: string; checkbox: boolean };

let quickPickItems: QuickPickItem[] = [];
let quickPickFilteredItems: QuickPickItem[] = quickPickItems;
let quickPickSelectedIndex = 0;
let quickPickSelectedFilteredIndex = 0;
let quickPickCanPickMany = false;

let inputElement: HTMLInputElement | HTMLTextAreaElement | undefined = undefined;
let outerDiv: HTMLDivElement | undefined = undefined;

const showInputCallback = (inputCallpackParameter: unknown): void => {
  const options: InputBoxOptions | undefined = inputCallpackParameter as InputBoxOptions;
  mode = 'InputBox';
  inputValue = options?.value;
  placeHolder = options?.placeHolder;
  title = options?.title;
  currentId = options?.id ?? 0;
  if (options?.prompt) {
    prompt = `${options.prompt} (${DEFAULT_PROMPT})`;
  } else {
    prompt = DEFAULT_PROMPT;
  }
  markdownDescription = options?.markdownDescription;
  multiline = options?.multiline ?? false;

  validationEnabled = options?.validate ?? false;
  ignoreFocusOut = options?.ignoreFocusOut ?? false;
  display = true;
  tick()
    .then(() => {
      if (display && inputElement) {
        inputElement.focus();
        if (options?.valueSelection) {
          inputElement.setSelectionRange(options.valueSelection[0], options.valueSelection[1]);
        }
      }
    })
    .catch((error: unknown) => {
      console.error('Unable to focus/select input box', error);
    });
};

const showQuickPickCallback = (quickpickParameter: unknown): void => {
  const options: QuickPickOptions | undefined = quickpickParameter as QuickPickOptions;
  mode = 'QuickPick';
  placeHolder = options?.placeHolder;
  title = options?.title;
  currentId = options?.id ?? 0;
  ignoreFocusOut = options?.ignoreFocusOut ?? false;
  if (options?.prompt) {
    prompt = options.prompt;
  }
  quickPickItems = (options?.items ?? []).map(item => {
    if (typeof item === 'string') {
      return { value: item, description: '', detail: '', checkbox: false };
    } else {
      // if type is QuickPickItem use label field for the display
      return {
        value: item.label ?? '',
        description: item.description ?? '',
        detail: item.detail ?? '',
        checkbox: false,
      };
    }
  });

  quickPickFilteredItems = quickPickItems;

  if (options?.canPickMany) {
    quickPickCanPickMany = true;
  }

  if (options?.onSelectCallback) {
    onSelectCallbackEnabled = true;
    // if there is one item, notify that focus will be on it
    if (quickPickItems.length > 0) {
      window
        .sendShowQuickPickOnSelect(currentId, 0)
        .catch((err: unknown) => console.error(`Error sending show quickpick ${currentId}`, err));
    }
  }

  display = true;

  tick()
    .then(() => {
      if (display && inputElement) {
        inputElement.focus();
      }
    })
    .catch((error: unknown) => {
      console.error('Unable to focus input box', error);
    });
};

onMount(() => {
  // handle the showInputBox events
  window.events?.receive('showInputBox:add', showInputCallback);

  // handle the showInputBox events
  window.events?.receive('showQuickPick:add', showQuickPickCallback);
});

const onClose = async (): Promise<void> => {
  if (validationError) {
    return;
  }
  const responseId = currentId;
  // perform cleanup before returning value to be able to show again the next showInputBox call
  // else we will have display being turned to true and then cleanup will do display = false
  cleanup();
  if (mode === 'QuickPick') {
    await window.sendShowQuickPickValues(responseId);
  } else if (mode === 'InputBox') {
    await window.sendShowInputBoxValue(responseId);
  }
};

async function onInputChange(event: Event): Promise<void> {
  const target = event.target;

  // Verify that target is an HTMLInputElement or HTMLTextAreaElement
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
    return;
  }

  // in case of quick pick, filter the items
  if (mode === 'QuickPick') {
    let val = target.value.toLowerCase();
    quickPickFilteredItems = quickPickItems.filter(item => item.value.toLowerCase().includes(val));
    quickPickSelectedFilteredIndex = 0;
    if (quickPickFilteredItems.length > 0) {
      quickPickSelectedIndex = quickPickItems.indexOf(quickPickFilteredItems[quickPickSelectedFilteredIndex]);
    } else {
      quickPickSelectedIndex = -1;
    }
    if (onSelectCallbackEnabled) {
      await window.sendShowQuickPickOnSelect(currentId, quickPickSelectedIndex);
    }
    return;
  }

  // skip validation if it is not enabled
  if (!validationEnabled) {
    return;
  }
  validationError = undefined;
  const value = target.value;
  const result = await window.sendShowInputBoxValidate(currentId, value);
  if (result) {
    validationError = result.toString();
  }
}

onDestroy(() => {
  cleanup();
});

function cleanup(): void {
  display = false;
  inputValue = '';
  placeHolder = '';
  prompt = '';
  validationEnabled = false;
  onSelectCallbackEnabled = false;
  quickPickCanPickMany = false;
  quickPickSelectedFilteredIndex = 0;
  quickPickSelectedIndex = 0;
  ignoreFocusOut = false;
}

async function validateQuickPick(): Promise<void> {
  let idToSend = currentId;
  let selectedIndexes: number[] | undefined;
  if (mode === 'InputBox') {
    // needs to convert the index from the filtered index to the original index
    const originalIndex = quickPickItems.indexOf(quickPickFilteredItems[quickPickSelectedIndex]);
    idToSend = currentId;
    selectedIndexes = [originalIndex];
  } else {
    // grab all selected items
    if (quickPickCanPickMany) {
      const selectedItems = quickPickItems.filter(item => item.checkbox);
      idToSend = currentId;
      selectedIndexes = selectedItems.map(item => quickPickItems.indexOf(item));
    } else if (quickPickSelectedIndex >= 0) {
      selectedIndexes = [quickPickSelectedIndex];
    } else {
      selectedIndexes = [];
      await window.sendShowQuickPickValues(currentId, []);
    }
  }

  // perform cleanup before returning value to be able to show again the next show call
  cleanup();
  await window.sendShowQuickPickValues(idToSend, selectedIndexes);
}

async function clickQuickPickItem(item: QuickPickItem, index: number): Promise<void> {
  if (quickPickCanPickMany) {
    // reset index as we clicked
    quickPickSelectedFilteredIndex = -1;
    item.checkbox = !item.checkbox;
    quickPickItems = [...quickPickItems];
    quickPickFilteredItems = [...quickPickFilteredItems];
  } else {
    // select the index from the cursor
    quickPickSelectedIndex = quickPickItems.indexOf(quickPickFilteredItems[index]);
    await validateQuickPick();
  }
}

async function handleKeydown(e: KeyboardEvent): Promise<void> {
  if (!display) {
    return;
  }

  if (e.key === 'Enter') {
    if (mode === 'InputBox') {
      // In case of validating error, do not proceed
      if (validationError) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      // keep the values to return (to avoid clearance during cleanup step)
      const returnId = currentId;
      const returnValue = inputValue;
      // perform cleanup before returning value to be able to show again the next showInputBox call
      cleanup();
      // return the value
      await window.sendShowInputBoxValue(returnId, returnValue, undefined);
      return;
    } else if (mode === 'QuickPick') {
      await validateQuickPick();
      e.preventDefault();
      return;
    }
  } else if (e.key === ' ' && mode === 'QuickPick' && quickPickCanPickMany) {
    // if space is pressed, toggle the item
    const originalIndex = quickPickItems.indexOf(quickPickFilteredItems[quickPickSelectedFilteredIndex]);
    quickPickItems[originalIndex].checkbox = !quickPickItems[originalIndex].checkbox;
    quickPickFilteredItems = quickPickItems;
    e.preventDefault();
    return;
  }

  if (mode === 'QuickPick') {
    if (e.key === 'ArrowDown') {
      // if down key is pressed, move the index
      quickPickSelectedFilteredIndex++;
      if (quickPickSelectedFilteredIndex >= quickPickFilteredItems.length) {
        quickPickSelectedFilteredIndex = 0;
      }
      quickPickSelectedIndex = quickPickItems.indexOf(quickPickFilteredItems[quickPickSelectedFilteredIndex]);
      e.preventDefault();
      if (onSelectCallbackEnabled) {
        await window.sendShowQuickPickOnSelect(currentId, quickPickSelectedIndex);
      }
      return;
    } else if (e.key === 'ArrowUp') {
      // if down key is pressed, move the index
      quickPickSelectedFilteredIndex--;
      if (quickPickSelectedFilteredIndex < 0) {
        quickPickSelectedFilteredIndex = quickPickItems.length - 1;
      }
      quickPickSelectedIndex = quickPickItems.indexOf(quickPickFilteredItems[quickPickSelectedFilteredIndex]);
      if (onSelectCallbackEnabled) {
        await window.sendShowQuickPickOnSelect(currentId, quickPickSelectedIndex);
      }
      e.preventDefault();
      return;
    }
  }
}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if display}
  <Modal on:close={onClose} name={title} top ignoreFocusOut={ignoreFocusOut}>
    <div class="flex justify-center items-center mt-1">
      <div
        bind:this={outerDiv}
        class="w-[700px] {mode === 'InputBox' ? 'h-fit' : ''} shadow-xs p-2 rounded-sm shadow-[var(--pd-input-field-stroke)] text-sm overflow-hidden">
        {#if title}
          <div
            aria-label="title"
            class="w-full bg-[var(--pd-input-field-focused-bg)] rounded-xs text-[var(--pd-input-select-hover-text)] text-center max-w-[700px] truncate cursor-default">
            {title}
          </div>
        {/if}
        <div class="w-full flex flex-row">
          {#if multiline}
            <textarea
              bind:this={inputElement}
              on:input={onInputChange}
              bind:value={inputValue}
              class="px-1 w-full h-20 text-[var(--pd-input-select-hover-text)] border {validationError
                ? 'border-[var(--pd-input-field-stroke-error)]'
                : 'bg-[var(--pd-input-field-focused-bg)] border-[var(--pd-input-field-focused-bg)]'} focus:outline-hidden"
              placeholder={placeHolder}></textarea>
          {:else}
            <input
              bind:this={inputElement}
              on:input={onInputChange}
              type="text"
              bind:value={inputValue}
              class="px-1 w-full text-[var(--pd-input-select-hover-text)] border {validationError
                ? 'border-[var(--pd-input-field-stroke-error)]'
                : 'bg-[var(--pd-input-field-focused-bg)] border-[var(--pd-input-field-focused-bg)]'} focus:outline-hidden"
              placeholder={placeHolder} />
          {/if}
          {#if quickPickCanPickMany}
            <Button on:click={validateQuickPick} class="px-1">OK</Button>
          {/if}
        </div>

        {#if mode === 'InputBox'}
          {#if validationError}
            <div class="text-[var(--pd-modal-dropdown-text)] border border-[var(--pd-input-field-stroke-error)] relative w-full bg-[var(--pd-input-field-stroke-error)] px-1">
              {validationError}
            </div>
          {:else}
            <div class="relative text-[var(--pd-modal-dropdown-text)] pt-2 px-1 h-7 overflow-y-auto">
              {prompt}
            </div>
            {#if markdownDescription && markdownDescription.length > 0}
              <div class="relative text-[var(--pd-modal-dropdown-text)] pt-2 px-1 h-fit overflow-y-auto">
                <Markdown markdown={markdownDescription} />
              </div>
            {/if}
          {/if}
        {:else if mode === 'QuickPick'}
          {#each quickPickFilteredItems as item, i (i)}
            <div class="flex w-full flex-row  {i === quickPickSelectedFilteredIndex
                  ? 'bg-[var(--pd-modal-dropdown-highlight)] selected'
                  : 'hover:bg-[var(--pd-dropdown-bg)]'}">
              {#if quickPickCanPickMany}
                <Checkbox class="mx-1 my-auto" bind:checked={item.checkbox} />
              {/if}
              <button
                title="Select {item.value}"
                on:click={async (): Promise<void> => await clickQuickPickItem(item, i)}
                class="text-[var(--pd-modal-dropdown-text)] text-left relative my-1 w-full px-1">
                <div class="flex flex-col w-full">
                  <!-- first row is Value + optional description-->
                  <div class="flex flex-row w-full max-w-[700px] truncate">
                    <div class="font-bold overflow-hidden text-ellipsis">{item.value}</div>
                    {#if item.description}
                      <div class="text-[var(--pd-modal-dropdown-text)] text-xs ml-2">{item.description}</div>
                    {/if}
                  </div>
                  <!-- second row is optional detail -->
                  {#if item.detail}
                    <div class="w-full max-w-[700px] truncate text-[var(--pd-modal-dropdown-text)] text-xs">
                      {item.detail}
                    </div>
                  {/if}
                </div>
              </button>
            </div>
          {/each}
        {/if}
      </div>
    </div>
  </Modal>
{/if}
