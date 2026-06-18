# AGENTS.md

## Project overview

This project is a WebGL Aquarium website controlled by a Muse 2 headband.

The goal is to let users connect their Muse device in the browser and use detected signals to affect the virtual aquarium.

## Coding rules

- Keep the project beginner-friendly.
- Use plain JavaScript, HTML, and CSS unless a build tool is already being used.
- Do not add React, TypeScript, Vite, npm packages, or a build system unless I specifically ask.
- Prefer small changes that are easy to understand.
- Add comments when changing Muse or aquarium-control logic.

## Muse rules

- Muse connection must happen from a button click because browser Bluetooth requires user interaction.
- Do not break existing Muse detection variables.
- Preserve blink, focus, head pose, accelerometer, gyroscope, and battery tracking when possible.

## Behavior mapping rules

When connecting Muse data to the aquarium:

- Start with one behavior at a time.
- Prefer simple mappings first.
- Use smooth transitions so fish behavior does not jump suddenly.
- Avoid changing too many aquarium settings at once.

## Testing

After changes:

- Run the site with a local server.
- Use `python -m http.server 8080` when possible.
- Test in Chrome or Edge.
- Check the browser console for errors.
- Confirm `window.museAquarium` exists.
- Confirm the aquarium still loads before testing Muse.

## Safety / cleanup

- Do not delete large sections of original aquarium code unless necessary.
- Do not rename core aquarium files unless I ask.
- Do not commit API keys, private files, or personal data.
- Keep changes easy to undo.
