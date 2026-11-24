# Changelog

## 0.3.1

Everything the 0.3.0 pre-release brought, now on the stable channel for everyone, and the changes since.

### New

- Every converter (game texture, cursor, VP6 movie, string table) opens a dialog in the editor: the files, all options with defaults, warnings, **Convert** and **Cancel**, then the progress and each file's result. Each takes several files at once, from a multi-selection in the Explorer or the archive tree, or chosen when run from the Command Palette.
- Each card of the **Converters** view lists its files, by **Add files…** or a drop on the **Drop Files** line below the cards (from Windows Explorer, VS Code's Explorer or the archive tree, no Shift needed), each removable, and **Convert…** opens that converter's dialog on them. A drop puts each file on the card of the one converter that takes it and a folder adds the files inside it; files several or no converters take are skipped, noted briefly in the status bar with the list in its tooltip.
- **Convert to VP6 Movie…** offers sizes grouped by aspect ratio (16:9, 4:3, 16:10), the source size and a custom size, starting at the source fitted to 1024 pixels wide, and shows each source's size and aspect ratio.
- **Sync with Assets…** can keep the catalogue as it was in `asset.dat.org` before Apply writes it (**Keep the original as asset.dat.org**, ticked while there is none). A kept original is never replaced, and **Restore Original asset.dat**, in the file's menu and the asset.dat viewer, copies it back.
- **Compare with Other Version…** on an INI or INC file (archive explorer, VS Code's Explorer, the editor's tab and bigFS menus) offers every other copy of its game path: each archive and folder of its load order, mods and the other game included, marked with its game, its place and which copy wins, and the retail original. It opens VS Code's diff editor with each side named after its archive and game, the other copy on the left and your file on the right.
- INI colour values get a swatch that opens VS Code's colour picker and writes the chosen colour back in the line's own notation, and the hover of a colour field shows the colour.
- **Appearance** in the object preview: snow, levels, upgrades, faction, random skins, damage, construction, build variations and other forms, each switched as the game does, with model, textures, parts, house colour, effects and animation following. Composed parts and the upgrades or levels that add them tick each other, and **Reset look** goes back to the object as created.
- **Abilities and effects** in the object preview lists everything an object can play: its abilities by button label, the improvements it sells, its weapons, level-ups and what it plays when damaged or dying. **▶** plays an entry once on the model with the unit's own animation, each effect at the time the INI gives it.
- The object preview's composition groups parts of one kind into a row that unfolds to a checkbox per part and per sub-object. A group whose parts have states of their own gets a **State** list, a siege crew follows its engine's state, and what `GrantUpgradeCreate`, `OCLUpdate` and `SpawnBehavior` place is drawn, so trebuchet towers carry their trebuchet and Mallorn trees their archer.
- **Shadows** in the object and FX previews draws a ground with the game's cast shadows and shadow textures, in a ground colour you choose.
- The wheels of porters, siege engines and Grond turn in their moving states.
- **Detail** switches a model to the game's medium and low models, and **Parts** shows and hides each mesh, with Show all and Hide all.
- **Textures** draws a model in one plain colour, and **House colour** picks a player colour, none or a custom one.
- A `.w3d` preview opens on **Used in**, the INI lines that name the model, each with **▶ Preview object**; **Related files** and **Texture sets** list the models, animations and skins that go with it.
- A sound's preview lists the audio events, music tracks and streams that play it, and shows a waveform you click to move the playhead.
- A cursor's preview saves any of its images as PNG.
- The **Converters** view brings the image, cursor, VP6 and string table converters together.
- **Search in Archives** searches file names too, from the archives' index tables, with the same filters.
- The archive tree follows the active editor, as VS Code's Explorer does (`explorer.autoReveal`).
- In a BFME II or ROTWK install opened in the workspace, the archives that came with the game are read-only (`bigfs.protectGameArchives`).
- Lists of INI uses (a texture's **Used by**, a model's or sound's **Used in**) show the archive each line comes from.

### Changed

- A VP6 movie wider than 1024 pixels is a warning, no longer refused: the retail game engine does not support it natively (the retail games crash on it), a patched game or another engine may. VP6's own limit of 4080 pixels still applies, and an odd width is rounded up to even.
- Movie files with chunks bigFS does not know are read, the unknown chunks skipped as the game skips them.
- Preview settings carry over to the next file of the same kind and are kept after VS Code restarts: the 3D viewer's bar and **⚙** row (Bones, Shadows, Move, speed, Loop, background, Detail, Textures, House colour, ground colour and the rest) in model, object and FX previews, a texture's zoom, channels, background and panel width, the map editor's layers, and the APT stage toolbar, which is now kept for every workspace rather than per workspace. What belongs to one file (its Appearance, state, animation, parts, edits and time) is not carried.
- The FX preview's emitter shapes are off at first; turned on, they stay on for the next effect.
- The 3D viewer has one bar: playback, the animation list, the time slider, speed, **Bones**, **Shadows** and **Move**. **⚙** opens a second row with the settings used less often, and controls a page cannot use are hidden instead of greyed.
- The object preview's panel starts with the object's name, kind, file, **Go to definition** and chips for what differs from the object as created, then folds Appearance, states, effects, abilities, composition, voices and parts into sections. States are grouped by purpose and searchable, the same effect on several bones is one row, voices are grouped by when they play, and labels are shorter.
- **Move** (or Shift+drag) moves the model or emitter over the ground in place of the Emitter motion list; the Readings switches are gone.
- The object preview loads the looks one press away ahead of time, composes large objects several times faster and shows changed model and texture files by itself.
- The FX preview keeps **Apply to INI** and **Reset** at the top of its panel with the number of values changed.
- A texture's **Used by** panel also lists the INI lines that name the texture outside `MappedImage` blocks, such as particle systems.
- The asset sync panel groups its rows by archive and keeps Apply in view.
- Rows that group others open by their arrow, as in a VS Code tree; their checkbox or name switches every member.
- The archive tree's menu has one submenu per file kind (Texture, Cursor, Movie, String Table, APT Movie, Model), also in VS Code's Explorer; the mod-wide tasks moved into the tree's **…** menu, and the INI editor's items into one **bigFS** submenu.
- Every command is listed under **bigFS:** in the Command Palette, and the settings show in four groups. Command ids, keybindings and setting keys are unchanged.
- **Search in Archives** answers a file name search within milliseconds, runs contents searches up to three times faster, and folds its filters under a **…** toggle.
- The APT editor is laid out like VS Code: an **Inspect | Interact** switch, an **Overlays** menu, **Frames**, **Motion** and **Placement** menus on the timeline, and Character, Inspector and Engine tabs. A movie plays from frame 0 as it opens, and the toolbar's choices carry over to the next movie.
- **Convert to Game Texture…** and the image converter offer only what the games use: TGA 24 and 32-bit, DDS DXT1 and DXT5.

### Fixed

- **Convert to VP6 Movie…** no longer writes movies the game crashes on: a movie is at most 1024 pixels wide by default and its width even, a larger source is scaled down to fit by default, and chunks are padded as the game's own movies are.
- Converting a movie again under the same name showed the old movie in its preview, so a smaller size looked as if it had not been applied; the preview now reads the new file.
- Converting a video through VS Code's browser engine (no FFmpeg) could wait forever when the video loaded before the reading page was ready.
- A state picked in the object preview and Appearance work together: the state's look shows in Appearance, a look switched afterwards keeps the state's animation, and a mounted hero's states on foot play without the horse.
- Textures stored as a JPEG with a PNG alpha are drawn, so Shadowfax wears his coat and house colour keeps the cloth's shading.
- Composed parts hide and show their sub-objects as the game does (Grond's trolls without trunks, the mumak's howdah), parts added by upgrades wait for their upgrade, and troops whose levels name a macro show their levels.
- An object preview opens on the object's idle, an expansion in the build variation its plots give it, and keeps what you picked through an INI edit.
- Nothing in the 3D previews switches back on by itself, and the viewer's keys keep working after a checkbox is clicked.
- Flames and glows built to face the camera do so in every 3D preview.
- The object preview's voice buttons play, and a sound played from an INI lens or hover opens the Sound panel ready to play with Enter.
- The archive tree's menu shows file actions by the row's own kind instead of the file open in the editor, and no longer offers writing actions on read-only rows.

## 0.3.0 (pre-release)

The changes listed under 0.3.1, published only on the pre-release channel.

## 0.2.3

- Fix: after the game language changes, hotkey clash warnings on CommandSets are checked again in the new language, and the `$KEY` text of APT movies a script loaded follows the new language too instead of keeping the old one.

- Fix: the published .vsix no longer contains the repository's release workflow file.

- Fix: every workspace folder resolves files and INI data against its own load order, so a BFME II folder never sees ROTWK's copies when ROTWK is open beside it or named as the base game. The BFME II main menu now draws BFME II's buttons instead of ROTWK's, and hovers, go to definition, diagnostics, APT text, sounds and previews take the definition, string or macro the folder's own game loads.

- Fix: when several places define one INI name, the winner follows the game's load order (loose files before archives, `___a.big` before `b.big`, a mod before its game) instead of the order the files were read in, so a saved file no longer drops behind the copies it overrides.

- New: the `bigfs.folderGame` setting states per workspace folder whether a mod folder is for BFME II or ROTWK (`auto` picks ROTWK when a ROTWK install is known). A ROTWK folder with no BFME II open finds BFME II from the registry, as the game does.

## 0.2.2

- Fix: the WND preview, the Create-a-Hero editor, the CommandSet editor and the INI missing-text problems follow a change of game language without reopening, and a WND preview opened right after start waits for the index so it shows text.

- New: the object preview draws what the game draws with the object: its other draw modules, the crew and passengers its contain module seats on passenger bones (a battering ram's crew, a mumak's archers), and a horde's members in their ranks, each with a checkbox naming the module it comes from.

## 0.2.1

- Fix: APT movies show the game's text in the chosen language even when opened before the INI index finished reading, follow a change of game language without reopening, and resolve `$KEY` strings their scripts push themselves instead of showing `MISSING`.

- Fix: hovering a string label or a `#define` name in INI right after start waits for the index instead of showing nothing, and go to definition on a string label such as `DisplayName = OBJECT:GondorFighter` opens its record in the chosen language's string table.

- New: the W3D preview lists the files related to the opened model, found through its objects' draw modules and the skeleton each file names: state and damage models, skins, the skeleton and the animations its objects' states play. Picking one switches the model or plays the animation on it.

- New: the 3D viewer's skeleton view marks attachment pivots apart from the other joints, names a joint on hover or every bone with **Names**, and follows the playing animation; it is offered only for models with a hierarchy.

- New: a **Custom…** background colour in the 3D viewer, remembered when the page is rebuilt.

## 0.2.0

First stable release: the same extension as 0.1.3, now on the Marketplace's release channel, so it installs without choosing the pre-release version.

## 0.1.3 (pre-release)

- Fix: loose files of a base game install that is not a workspace folder are read-only in the game view. Import image, Export as PNG, Edit W3D Animation, Convert String Table and Convert to VP6 no longer appear on them, and when run from the palette they ask where to save instead of writing into the install.

- Fix: saving into an archive of 64 MB or more no longer overwrites an entry that shares its offset with an empty one.

- Fix: crafted or broken APT, W3D, INI, STR, PNG, VP6, TGA and RefPack files are refused with a message instead of exhausting memory, hanging or crashing the editor; large valid .ru files, long CSF and CAH strings and large shapes and maps no longer fail to open.

- Fix: saving an APT movie after an undo writes what the editor shows, JPEG-backed mapped images draw, bulk edits and the new object wizard no longer misplace changes in archive files with unsaved edits, and a movie rename skips importers it cannot write up front.

- Fix: closing the video reader no longer hangs a conversion, and converting a .vp6 onto itself asks first; CSF tables from a game install open read-only; Validate INI no longer reports success after a cancel.

- Fix: Reset in the APT script editor discards the draft instead of applying it; armor table edits keep focus and the typed text; the string table no longer swallows the click after leaving a cell; video playback stops cleanly at a frame it cannot decode; notices stay up their full time.

- Fix: bulk edit no longer overflows the stack on ChildObjects that inherit from each other; deleted loose INI folders and removed #define overrides leave the index correctly; mapped image hovers stop showing stale pictures.

- Faster: texture, PNG, VP6 and WAV decoding, archive imports and transfers, and the APT, particle, timeline, map and catalogue pages redo far less work; INI, STR, WND and APT text checks wait for a pause in typing.

## 0.1.2 (pre-release)

- asset.dat in the explorer: each install's catalogue opens in a viewer, and a sync panel lists the files no record stands for, the records no file answers and the out-of-date model records, and writes the catalogue back.

- Fix: opening a game install under Program Files and choosing the game view no longer fails on the read-only folder; the choice falls back to the user settings, so loose folders such as data/cursors show.

## 0.1.1 (pre-release)

- Fix: the Open button beside an imported character's source movie selects that character in the movie it opens, also when the movie is already open.

- Fix: WAV previews play every PCM file, not only IMA ADPCM ones. 8, 16, 24 and 32-bit PCM, IEEE float and the extensible header are decoded and rewritten as 16-bit PCM like ADPCM already was; before, PCM went to the page as the Buffer it was read into, which arrives there as a plain object and does not play.

## 0.1.0 (pre-release)

First Marketplace release, published as a pre-release.

- Fix: INI reference checking is keyed by block and field. `Object`, `ChildObject` and `ObjectReskin` are one namespace and a `ChildObject` header's parent is a reference; `#define` bodies are indexed so rename and find references follow a name through macros; macro chains of any depth evaluate and only a real cycle is reported; flags, `Filename`, cursor images and the auto-resolve tables are not references; `ParticleSysBone` checks its particle system only; nested `Region` and `RadiusCursorTemplate` blocks are definitions; a SCREAMING_SNAKE value is skipped case-sensitively; rename edits unsaved documents; a UTF-8 byte order mark no longer starts the first INI or STR line (reference rules ported from mint's `ini` crate). Particle fields that listed `FXParticleSystem` alone (`ParticleSysBone`, `WadingParticleSys`, `PerParticleAttachedSystem`) also resolve old-format `ParticleSystem` blocks.

- Fix: every lookup resolves a file the way the game does (after mint's `big` crate): loose files beat archives, archives in the engine's order with the first winning, installs layered as a mod, then ROTWK, then BFME II, so `___a.big` beats `b.big` and the right `aptcomponents_001.tga` is found. Installs are named by their marker files; `bigfs.baseGameFolder` (and the new `bigfs.underlyingGameFolder`) is the lowest layer and feeds the game view; workspace folder order is the fallback between folders of one kind. Loose files are found under the game's top folders, so a mod of INI files alone shows. Compare and Package Mod read the base's loose files and its BFME II layer, never count a packed archive as base, and no longer offer the base game folder as the output; Package Mod counts INI errors by checking the folder. The game view rebuilds once per burst of changes, Refresh and workspace folder changes are handled, Compare can be cancelled, a refused cut-paste keeps the clipboard, and writing into an unread archive reads it first.
- WND layout preview draws what the game draws: each window type's own image slots (check box, sliders, list box, combo box), `MappedImage` pictures from the game's textures with rotation, text through the string tables, an Enabled / Hilite / Disabled (+ Checked) switch, and engine-placed children kept inside their parent (ported from mint2's apt-viewer gadgets). A key stated twice reads as its last statement.
- Fix: INI grammar. `AddEmotion` opens a block only as `AddEmotion = OVERRIDE`, `End` with trailing tokens closes its block, mint's hand-written block tables are in the schema (`StanceTemplate`, `FormationTemplate`, `LODPreset`, `BenchProfile`, `WebpageURL`, `OptionGroup`, `StrategicHUD`, horde `MeleeBehavior`, ...), `.inc` fragments read a keyword several contexts open as their union, and Generals' flat `ParticleSystem` blocks are one hint each.

- Fix: APT scripts that goto each other overflowed the stack and broke the editor; frames entered by a goto now queue their scripts, a failing script is reported instead of thrown, and only clips scripts touched are checked each frame. The Engine panel overrides any variable the movie reads instead of only supplying unset ones.

- APT preview runs ActionScript in full (ported from mint2's AVM), and an Engine panel lists what the movie asks of the game: functions only the engine calls, with a Call button; values it reads but never sets, and extern keys, each settable; calls into the engine with their arguments and a settable return.

- BIG archive explorer with editing, extraction and import; saves keep the
  archive as shipped (names, duplicates, header, trailer).
- Safety: entry names that would escape an extraction folder are refused.
- SAGE INI language support on the games' own grammar, with diagnostics,
  whole-workspace validation, game text on hover and rename.
- Previews for TGA, DDS, WAV and W3D files.
- Mod workflow: pack a folder, override archive files, search archives.
- APT movie editing: text fields, colours, bounds, exports and imports,
  placements, frame labels, frames and duplicated characters, with undo;
  untouched bytes are kept as shipped.
- APT ActionScript as an editable JavaScript-like language, checked to
  compile back to the same code before it is shown; hot-exit backups keep
  movie edits.
- APT timeline panel: tweens with easings, per-property formulas, fading,
  removing and showing for a range, and inserting, deleting, duplicating,
  reversing and retiming frames; onion skin.
- Particle preview: colour, alpha and size curves over a particle's life,
  with draggable, addable and removable keys.
- Particle preview: handles on the emission volume to size it in the view.
- Particle system templates: fire, smoke, sparks, dust cloud, magic glow, flash.
- FX list timeline in the particle preview: nugget bars, mute and solo, drag to delay.
- Particle preview load stats: peaks, averages, per system, fill, detail-level budgets.
- Bulk Edit INI Values: formula changes across matching blocks, reviewed as a diff.
- Effective definition view for ChildObject and ObjectReskin lineages.
- Package Mod: pack with a load-order override report against the base game.
- New Unit, Hero or Building wizard: object, build button, command set slot and text in one go.
- Check Translations: labels each language lacks, filled with stand-in text on request.
- APT timeline recognises baked tweens and edits them as one.
- APT motion scripts: a timeline as a few CSS-like lines, baked into frames.
- APT copy and paste motion, mirrored on request.
- Particle preview: scale a whole effect in size and time.
- Particle preview: A/B against the written values, random variations, save as a variant.
- Particle preview on a model, started at one of its bones.
- Edit W3D Animation: retime, reverse, ease, trim and rate, written as a new animation.
- Armor Table: every armor against every damage type, edited in place.
- CommandSet editor: drag buttons between slots, clear and add.
- Balance sheet: damage-a-second column.
- Compare with Base Game lists INI changes definition by definition and value by value.
- Links between formats: model, animation and texture names in INI open the file in its viewer; the W3D viewer lists the INI lines using the file, and an animation plays on the model its object's INI names.
- Object preview: "Preview object" and "Preview state" lenses, and "Preview on the object" on animation, FX and ParticleSysBone lines. Shows the composed object's model, plays its animations, and runs its FX and bone particle systems on it, each with a toggle.
- One model renderer for the W3D viewer and the particle preview: the particle preview now shows the model textured and lit. Bones toggle with B.
- W3D viewer: an animation file plays on the model drawn on its skeleton, found by name; bones stay a toggle.
- Fix: W3D models are textured as the game draws them: V measured from the bottom, the texture and coordinates of the first material pass (also for shader-material meshes), cutouts only where the material alpha-tests, additive and alpha-blended meshes blended.
- APT playback respects action scripts by default: stop() stops, gotoAndPlay jumps, and "Play from…" starts at frame 0 or any label. "Ignore action scripts" (S) plays every frame in order instead.
- APT clip masks are applied as the game draws them, and the canvas is sized to what they let show. "Show masks" (M) draws everything instead: what a mask hides faintly, the masks outlined, and the canvas sized to the whole animation.
- APT timeline: a row of frame labels, each listing who jumps to it, and a row showing what each frame script does (stop, play, jumps); hovering a jump lights its target, clicking goes there. A frame's script in the details lists its jumps, each a button to the frame it lands on.
- Fix: an FX list's ParticleSystem and Sound nuggets' Name goes to its definition, finds references and is checked.
- APT playback speed from 0.05× to 8× of the game's 30 frames a second, `[` and `]` to change it.
- String tables: `.str` language support and table editor, `.csf` editor,
  and conversion between the two.
- Map editor for `.map` and `.bse`: terrain relief with objects and start
  positions, world info, time of day, players and object properties, with
  RefPack compression both ways.
- W3D animation playback on models and skeletons.
- `.wnd` window layouts: language support and a live layout preview.
- MP3 and VP6 video previews.
- Texture round trips: export TGA/DDS as PNG, replace a texture from a PNG,
  convert PNGs to TGA or DDS.
- Compare a mod with the base game: added, changed and unchanged files with
  diffs.
- Fixed: flaky extraction tests that read an archive a watcher had just reset.
- INI quick fixes, a formatter, and MappedImage hovers that show the image.
- Maps: teams, scripts (switch on/off), trigger areas and lighting edits.
- APT: create new text, sprite, shape and image characters.
- APT: create new movies with exported sprites, and add or remove imports so
  root movies can use them.
- Lua syntax checking inside INI script regions.
- Missing models, animations, textures and sounds reported in INI files,
  with quick fixes.
- Particle preview for particle systems and FX lists, with a slider for
  every value and Apply to INI.
- Launch Game with Mod, with a Run mod status bar button.
- Convert videos and image frames to VP6 movies.
- VP6 conversion codes inter frames with motion search and tuned
  probabilities, about 3 times smaller.
- Find Unused Definitions.
- Hotkey clashes inside CommandSets reported.
- Call and type hierarchy for INI definitions.
- Balance sheet of every unit's numbers, editable in place.
- Duplicate Definition, with its game text copied.
- Missing game-text labels reported, with a fix that adds them.
- CommandSet hover with the button icons, labels and commands.
- Play audio events and sounds from INI files.

- INI: sound and announcer fields resolve into the engine's one audio namespace (AudioEvent, DialogEvent, MusicTrack, AmbientStream, StreamedSound, Multisound) or the announcer one, and navigation, references, rename and the missing-name check see the name inside `EVA:`, `+SOUND:`, `Sound:` and `name:weight` forms. A block's own `Filename` is no longer read as a reference.
