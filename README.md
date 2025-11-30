# ELL Knowledge Builder Plugin
This Obsidian plugin is created by a group of Northeastern undergraduate students part of the Experiential Learning Lab. This purpose of this plugin is to create a shared knowledge garden that enhances note-taking workflow and organization in group settings.

## Features Implemented
### Pinned Notes

To pin a note:
1. Navigate to the Files tab
2. Right-click on a file or folder
3. A context menu will appear. To pin, click "Pin to Pinned Notes"
4. Navigate to the Pinned Notes tab

To unpin a note:
1. Navigate to the Pinned Notes tab
2. Right-click on a file or folder
3. A context menu will appear. To unpin, click "Unpin"

### ADD NEXT FEATURE HERE

## Technical Approach:
- Core plugin logic in `main.ts`
- Feature modules (like `pinned-notes.ts`) for specific functionality
- Centralized settings in `settings.ts`

## To Add a New Feature:
1. Create a new file to store all of the code for the feature
2. In that new file, ensure there is a function to create the feature, in this format: `initializeFeature(this, this.settings, this.saveSettings.bind(this));`
3. Edit the `settings.ts`, add any information necessary for the feature
4. In `main.ts`, import and call the`initializeFeature(...)` for the specific feature
