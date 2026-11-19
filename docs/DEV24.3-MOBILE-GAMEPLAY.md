# DEV24.3 mobile gameplay polish

Source rollback is `892c0ef3f5403d5de965734a5b255a5dc0d6a2cb`. DEV24.1 graphics and DEV24.2 menu and rule behavior carry forward.

- The live landscape HUD groups safe-area readouts into a compact score and objective area and separate radar, vitals and ammunition areas. Radar and readout sizing use the saved HUD preferences. The mobile Infection banner gives the objective while the status line shows incubation. The control guide's Skip target clears the action buttons. Low ammo and reload use distinct feedback.
- The larger left-hand control layout aligns Aim and More with their intended rows. Custom dragged positions stay in force. A second finger can no longer take over an active HUD editor drag. Opening the live buy menu releases held touch actions and clears queued mobile input.
- Settings opened during a match returns to the match menu, with Resume available. Existing graphics presets and saved settings stay in effect.

## Isolated evidence

At 568 × 320, the baseline tutorial Skip covered Swap's center, several HUD readouts crossed simulated 24 px left and 22 px right safe insets, and the larger left-hand layout placed More over Aim. The revised HUD was inspected in live Infection at 568 × 320 and 844 × 390.

Headless touch input verified concurrent movement, aim and fire, cancellation, and selecting High from the match menu before resuming. At 568 × 320 with simulated insets, both left-hand fire controls and all checked actions remained independently reachable at 115% control size. Focused source tests cover HUD editing and buy interruption. The archived ownership fixture stopped at a missing tutorial stub, so it did not supply acceptance evidence. Source checks and previews do not establish physical touch latency, Android GPU performance or real LAN behavior.

The next acceptance APK should combine DEV24.1 graphics, DEV24.2 menus and these controls under the persistent acceptance package. On devices, verify both hand layouts, custom placement, concurrent inputs, lifecycle recovery, reload and objective visibility, sustained frame pacing and LAN in both directions.
