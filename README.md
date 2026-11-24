# bigFS

bigFS turns VS Code into a modding workbench for the SAGE-engine *Battle for
Middle-earth* games: *The Battle for Middle-earth*, *The Battle for
Middle-earth II* and *The Rise of the Witch-king*. It opens the games' BIG
archives as folders you can edit in place, understands their INI dialect the
way a language server understands code, and previews or edits the formats a
mod is made of: W3D models, APT interface movies, maps, textures, sounds,
cursors and VP6 videos.

bigFS ships no game content. It works on your own installation and your own
mod files, and it never writes into a game install.

## Getting started

1. Open your mod folder as the workspace. It can hold loose files, archives
   or both.
2. Point bigFS at your game: run **bigFS: Find Game Installs…**, which looks
   in the registry, the usual EA app, Origin and Program Files folders and
   Wine, Proton or CrossOver prefixes, or set `bigfs.baseGameFolder` (ROTWK)
   and `bigfs.underlyingGameFolder` (BFME II) yourself.
3. Open the **BIG Archives** view in the Explorer. Every archive of the
   workspace and the game is there as a folder; open any file in it as you
   would open a file on disk.

From then on, INI files get completion, hovers, go to definition and
problems across your mod and the game, and model, texture, sound and movie
files open in bigFS's previews.

## Archives and load order

The **BIG Archives** view lists the archives of each workspace folder and of
the game installs. Inside a writable archive you can create, rename, delete,
cut, copy, paste, duplicate and drag files and folders, including between
archives and in from the Explorer or your file manager. A save rewrites the
archive through a temporary file and keeps names, duplicates and header
layout exactly as the game shipped them. **Extract…** copies files out,
**Override in Folder…** copies them into your mod at the same path, and
**Pack into BIG Archive…** turns a folder into an archive.

**Show What the Game Loads** switches the view to one merged tree holding
only the copy of each file the game would load. bigFS resolves every lookup
(hovers, links, previews, the APT library) the same way:

- a loose file beats every archive of its install;
- archives are read in path order and the first one holding a file wins, so
  `___mymod.big` beats `INI.big`;
- a mod folder sits above its game, ROTWK above BFME II. Each workspace
  folder resolves against its own game only, so a BFME II folder never sees
  ROTWK's files. `bigfs.folderGame` says which game a mod folder is for.

**Your game stays untouched.** Installs you name in the settings and do not
open as a workspace folder are read-only.
When you open a BFME II or ROTWK install itself as a workspace folder, the
archives that came with the game are read-only as well, while archives you
added beside them stay writable; `bigfs.protectGameArchives` turns this off.
Commands that would write into a game file ask where to save instead.

**Search in Archives** (a view under the archive tree) searches the text
inside every archive, or the names of every entry, with case, whole word,
regular expression and include and exclude filters, much like VS Code's own
search, which cannot see inside archives. **Go to File in Archives…**
(`Ctrl+Alt+P`) is Ctrl+P for archive files.

**Compare with Other Version…** on an `.ini` or `.inc` file (right-click in
either explorer, or the editor's tab) lists every other copy of the same game
path, such as `data\ini\commandset.ini`: each archive and folder of the
load order, a mod's and the other game's, each with its game and its place,
the copy that wins and the retail original marked. The pick opens VS Code's
diff editor with each side named after its archive and game, the other copy
on the left and your file on the right; a game archive's side stays
read-only. **Choose a File…** compares with any file on disk or in an archive.

The tree's **…** menu holds the mod-wide tasks:

- **Compare with Base Game** lists what your mod adds and changes, down to
  the INI values it changes in each definition.
- **Package Mod…** reports what the mod overrides before packing it into one
  archive.
- **Launch Game with Mod** starts the game with `-mod` on your folder; a
  **Run mod** button stays in the status bar.
- **Check Translations** lists the string labels each language lacks and can
  fill them with stand-in text.
- **Sync with Assets…** compares an install's `asset.dat` catalogue with the
  files the game loads and writes the updated catalogue into your mod folder.
  **Keep the original as asset.dat.org** (ticked) copies the catalogue there
  first, once: a second sync never replaces it. **Restore Original
  asset.dat**, in the file's menu and the viewer, copies it back.
- **Validate INI Files**, **Find Unused Definitions**, **Check APT Movies**,
  **Open Balance Sheet** and **Armor Table**.

## INI language support

`.ini`, `.inc` and `.bhav` files get a language built from the games' own
field tables (from [mint](https://github.com/max-bronner/mint)), for ROTWK,
BFME II or BFME (`bigfs.ini.game`). A `.ini` switches to it when its content
looks like game INI. bigFS indexes every INI file of your mod and the game,
loose or in archives, so everything below works across both:

- highlighting, outline, folding, completion and formatting;
- hover with the engine's field types, the game text of a string label in
  your chosen language, the picture of a `MappedImage` and the buttons of a
  `CommandSet`;
- a colour swatch before every colour value (`R:40 G:60 B:200 A:255`) that
  opens VS Code's colour picker and writes the choice back in the line's own
  notation, and the colour in the hover;
- go to definition, find references, rename, call and type hierarchy, through
  `#include` and `#define`;
- problems for unknown fields, unclosed blocks, undefined references,
  missing game text, missing models, textures and sounds, and hotkey clashes,
  with quick fixes.

Model, animation, texture and sound names are links to the file. Lenses above
the definitions open the tools that go with them: **▶ Preview object**,
**Preview** for particle systems and FX lists, **▶ Play** for audio events,
**Effective definition** (an object as the game composes it from its
`ChildObject` or `ObjectReskin` parents), **Edit slots** for a `CommandSet`
and **Edit region in texture** for a `MappedImage`. The editor's **bigFS**
context menu adds **New Unit, Hero or Building…**, **Duplicate
Definition…**, **New Particle System from Template…** and **Bulk Edit INI
Values…**, which applies one formula to a field across many blocks and shows
every change as a diff to review first.

## Object preview

**▶ Preview object** shows an object as the game draws it, not just its
model. bigFS reads the object's draw modules, states, upgrades and scripts
and composes what belongs with it:

- **Appearance** sets what a map, a level or an upgrade changes: weather,
  level, faction, upgrades, random skin, damage, construction and build
  variation. Model, textures, hidden parts, house colour and effects follow
  the game's rules for choosing a model state.
- **State and animation** lists the object's states by purpose; picking one
  plays it with its effects, which fire on the frames the INI gives them.
- **Composition** draws what comes with the object: other draw modules,
  crews and riders on their bones, a horde's members in their ranks, and
  what upgrades and creation lists add. Each part has its own checkbox and
  follows the state you pick.
- **Abilities and effects** lists what the object can play (abilities,
  weapons, level-ups, what it plays when damaged or dying), and **▶** plays
  one on the model with the unit's own animation.
- **Voices** lists every sound field with its own play button.

The preview stays muted: sounds play only from their own buttons. It keeps
your choices while you edit the INI and redraws as you type.

## Previews and editors

All 3D views (W3D files, object and particle previews) share one viewer with
the same camera and controls: playback, animations from any skeleton, bones,
parts, detail levels, house colour, shadows and a plain-colour mode.

View settings carry over: the next model, object, effect, texture, map or
APT movie you open starts with the toolbar choices you left in the last one
of its kind, also after a restart. What belongs to one file, such as an
object's Appearance, the state or animation picked, or an edit, does not.

| File | What bigFS does |
| --- | --- |
| `.w3d` | 3D preview with the game's materials and animations, the INI lines that use the model, and its related files and texture sets |
| `.tga`, `.dds` | preview with zoom, channels and mip levels; the `MappedImage`s and APT shapes cut from the texture, drawn as boxes you can drag to edit their regions |
| `.wav`, `.mp3` | player with the audio events that use the sound (MP3 in VS Code's own player) |
| `.vp6` | video player with seeking and alpha |
| `.cur`, `.ani` | every image with its hotspot, the animation played, and Save as PNG |
| `.apt` | the APT movie editor (below) |
| `.str`, `.csf` | string table language and table editor; conversion between the two |
| `.wnd` | window layout language with a live layout preview |
| `.map`, `.bse`, `.scb` | map editor (terrain, objects, waypoints, trigger areas, players, teams, lighting and scripts); script files read-only |
| `.cah` | Create-a-Hero editor that recomputes the checksum the game checks |
| `asset.dat` | the catalogue's records as a table, and the sync panel |

The particle preview for `FXParticleSystem`, `ParticleSystem` and `FXList`
blocks puts a slider on every value and writes the result back with **Apply
to INI**. It can scale an effect in size and time, show it on any model's
bone, edit its colour and size curves, and lays an FX list out on a
timeline.

## APT interface movies

The APT editor plays a menu or HUD movie the way the game does, running its
ActionScript, and lets you edit every record of it with undo: text,
placements, frames, characters, imports and exports, and scripts, which are
shown as a small JavaScript-like language and compiled back. A movie you do
not change saves byte for byte, and an edit touches only its own fields.
**Open APT as Text** shows the whole movie as one editable text instead.

A movie expects the game around it. The **Engine** panel lists what the
movie asks of the game as it runs: functions only the engine calls (such as
the palantir's `SetPlayerFaction`), with a **Call** button; values and
externs it reads, which you can set; and its calls into the game, to which
you can give a return value. Where the game would feed a value from its INI,
the field suggests it. Your answers are kept per movie, so the menu comes up
the same way next time. Text such as `$KEY` shows in the chosen game
language, and movies a script loads are found in the load order.

The timeline sets ranges of frames at once (tweens with easings, formulas,
fades, retiming) and recognises tweens already baked into a movie.

## Converters

The **Converters** view (under the Explorer) brings the converters together,
and each one is also on the right-click menu of the files it takes and in the
Command Palette. Each opens a dialog in the editor listing the files, its
options with defaults and any warnings, then **Convert** shows the progress
and each file's result. Several files convert at once: select them in the
Explorer or the archive tree, or collect them on a converter's card in the
view: each card lists its files, added with **Add files…** (Ctrl+A in the
picker takes a whole folder) or by dropping files or folders on the **Drop
Files** line below the cards, from Windows Explorer (or another file manager),
VS Code's Explorer or the archive tree. A drop puts each file on the card of
the one converter that takes it and a folder adds the files inside it; files
several or no converters take (a `.png` fits both the texture and the cursor
card) are skipped, with a short note in the status bar whose tooltip lists
them. **×** removes a file, **Remove all** empties a card, and **Convert…**
opens the converter's dialog on its files.

- images (PNG, JPEG, BMP, GIF, WebP, TGA, DDS) to TGA 24 or 32-bit or DDS
  DXT1 or DXT5, with or without mipmaps;
- PNG to cursor, cursors to PNG, and images to an animated cursor;
- videos, images and numbered frames to VP6 (any video with FFmpeg,
  otherwise WebM, Ogg and MP4), at a size picked from presets by aspect ratio
  (16:9, 4:3, 16:10), the source size or a custom one, starting at the source
  fitted to 1024 pixels wide. A wider movie is allowed with a warning: the
  retail games crash on movies wider than 1024 pixels;
- `.str` to `.csf` and back.

A texture's own menu also exports it as PNG and replaces it from a PNG,
written back in its own format.

## Game language

bigFS shows game text from the string table of one language, picked from the
`lang` archives of the install. With one language installed it uses that;
with several it asks once per workspace. **bigFS: Choose Game Language…** or
`bigfs.language` changes it, and hovers, APT movies and layout previews
follow at once.

## Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `bigfs.baseGameFolder`, `bigfs.underlyingGameFolder` | empty | The game installs your mod builds on |
| `bigfs.folderGame` | `auto` | Per folder: whether a mod is for `bfme2` or `rotwk` |
| `bigfs.language` | `auto` | Language of the game text |
| `bigfs.game.executable`, `bigfs.game.arguments` | empty | What Launch Game with Mod starts |
| `bigfs.explorer.view` | `archives` | One tree per archive, or the merged `game` view |
| `bigfs.protectGameArchives` | `true` | Keep a game's own archives read-only |
| `bigfs.ini.game` | `rotwk` | INI grammar: `rotwk`, `bfme2` or `bfme1` |
| `bigfs.ini.checkReferences`, `bigfs.ini.checkAssets`, `bigfs.ini.checkStrings` | `auto` | Report undefined references, missing files and missing game text |
| `bigfs.ffmpegPath`, `bigfs.vp6.keyFrameSeconds` | empty, `2` | VP6 conversion |

Every command is in the Command Palette under **bigFS:**, or on the context
menu of the row, file or editor it acts on.

## Licence

GPL-3.0-or-later. See [LICENSE](LICENSE). Parts are ported from
[mint](https://github.com/max-bronner/mint); see `THIRD-PARTY-NOTICES.md`
for third-party code.
