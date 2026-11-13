# Filtr

Filter X posts below the fold using a local Laya multilingual 322M decision model, WebGPU, and editable topic phrases. No API key or local server is needed after the extension is built and installed. Posts and preferences stay on the device.

## Develop

Requires Bun 1.4.3 and a Chromium browser with WebGPU and `shader-f16`.

```sh
bun install --frozen-lockfile
bun run model:download
bun run typecheck
bun test
bun run build
```

Load `.output/chrome-mv3` as an unpacked extension from `chrome://extensions` (Developer mode → Load unpacked). Open Filtr, review the defaults, and choose **Start filtering**. Reload existing X tabs after first installing or updating the extension.

`bun run dev` watches source changes. Reload the unpacked extension after rebuilding. `bun run zip` creates `.output/filtr.zip`.

Build, watch, local serving, tests, and dependency management use Bun. Native TypeScript (`tsgo`) checks types separately. React 19 renders the popup. There is no WXT, Vite, or external inference service.

## Filtering

The default excludes migration/immigration, posts focused on Black people, sexual violence, extreme negativity, and foreign political/culture-war content. It is intended to keep this Czech account's feed focused on ordinary Czech life and useful discussion.

Enter one natural-language condition per line. Any matching condition can hide a post. The default model threshold is 0.45, selected on a small authored development set; it is a match score, **not a measured probability of correctness**. Editable topic phrases handle explicit exclusions first. Phrases match whole words with accents ignored; a trailing `*` matches word endings. The model handles broader meaning and tone. Likes filtering is optional and disabled by default.

The classifier reads visible post text, including quoted text. It cannot inspect images, video, audio, text hidden behind “Show more,” or linked articles. Media-only posts pass through. Oversized inputs and inference failures also pass through; inputs are not silently truncated.

## Scrolling and resource use

- Posts already in view or above the viewport stay unchanged.
- Nearby posts up to two viewports below the fold enter a bounded queue.
- Pending posts reserve their layout space. A rejected post is removed from the feed entirely, with no placeholder.
- Requests time out after 12 seconds and restore the post. Pausing restores all posts controlled by Filtr. Settings changes and recycled X rows invalidate old decisions.
- A single offscreen document owns a dedicated WebGPU worker shared by all X tabs. Model decisions are cached for up to 500 text/rule pairs; each feed also remembers 500 post decisions across recreated rows. Changing settings clears the feed's decisions. GPU resources unload after five idle minutes.
- Recent filtered text is stored locally for inspection (50 posts, 1,200 characters each).

The pinned FP16 model has about 647 MB of graph/weights plus a 34 MB tokenizer. It is bundled with the extension, so there is no first-run network download and the extension CSP restricts connections to itself. Runtime GPU memory is larger than the download size. Firefox/Safari packaging is not implemented.

## Verify the model

`bun run lab` opens a local evaluation server at `http://127.0.0.1:5181/lab/`. Load the model, run the Czech/English benchmark, and optionally test scrolling on synthetic posts. The first 24 cases are development smoke cases; 20 additional cases were frozen before the final default evaluation. The lab saves its full report locally to `artifacts/evaluation.json`.

See `docs/model-evaluation.md` for measured results and rejected candidates. This set is small and authored, so results are not a production accuracy claim. A live X scrolling test confirmed below-fold filtering but found false hides and missed outrage content. The defaults remain experimental.

See `THIRD_PARTY_NOTICES.md` for source and model provenance.
