# Proveras Fullscreen 3D Home Design

**Date:** 2026-09-04
**Status:** Approved direction; written specification awaiting owner review

## 1. Purpose and delivery order

Create a fullscreen, scroll-directed 3D homepage for Proveras that presents the salon through an editorial, stylized client seated in a simulated salon room. The camera moves from hair viewed from behind to the face and eyebrows, then to the hands and nails, and finally back to a second hairstyle.

This experience is a future frontend lot. It must not interrupt Phase 2 identity and authorization. The immediate next project lot remains Phase 2 Task 4: Auth.js JWT sessions and current-state authorization guards. The 3D lot begins only after its own implementation plan is approved and the prerequisite frontend design system is available.

## 2. Approved experience

The homepage contains only:

- a fixed, compact header with the Proveras identity;
- primary navigation to the booking page and portfolio page;
- a fullscreen 3D scene below the header;
- short accessible HTML labels or calls to action synchronized with the current act;
- loading, unsupported-device, error, and reduced-motion fallbacks.

Traditional homepage sections do not appear below or alongside the scene. The visitor scrolls through a pinned narrative; scroll progress controls the scene timeline instead of starting an uncontrolled autoplay sequence. The header remains usable throughout loading and animation.

## 3. Art direction

The chosen direction is **editorial stylized 3D**: elegant, feminine, warm, and recognizable without attempting photographic realism. Shapes are simplified, silhouettes are intentional, materials are soft, and the approved pink/white light theme and black/pink dark theme guide the room, furniture, lighting, and overlays.

The avatar is fictional and must not reproduce a real customer, employee, celebrity, or portfolio subject. Skin tone, face, hair, hands, and proportions must be inclusive and respectful. Camera framing must remain appropriate for a professional salon presentation and must not sexualize the character.

The room suggests a contemporary salon through a chair, mirror, counter, plants or restrained decorative objects, and framed portfolio work. Decoration cannot compete with the current service focus.

## 4. Narrative and scroll timeline

The scroll timeline has four semantic acts. Exact progress ranges may be tuned after visual testing, but the order and content are fixed.

### Act 1 — Hair from behind

- Start with the client seated and viewed from behind.
- Establish the salon room and first hairstyle.
- Use a slow camera approach or small orbit; do not rotate continuously.
- The accessible label identifies a hair-service presentation without claiming a real result.

### Act 2 — Face and eyebrows

- Orbit the camera to a frontal three-quarter view.
- Settle before highlighting the eyebrow region.
- Change lighting or a restrained visual accent rather than zooming abruptly into the face.
- Keep eyes and facial expression natural and calm.

### Act 3 — Hands and nails

- Move the camera down to hands positioned naturally near the salon chair or a manicure surface.
- Present the selected nail variation with enough time and framing to understand it.
- Avoid disembodied hands, clipping, extreme close-ups, or gestures that read incorrectly.

### Act 4 — Second hairstyle

- Return the camera smoothly to the head and rear or three-quarter view.
- Transition to a visibly different hairstyle through an approved mesh, morph, or material change.
- End in a stable composition that keeps the header and booking navigation prominent.

Scrolling backward reverses the timeline deterministically. Rapid scrolling may ease toward the requested progress but must never skip to an undefined visual state.

## 5. Technical architecture

The implementation uses:

- `three` for the rendering engine;
- `@react-three/fiber` for declarative React scene composition;
- `@react-three/drei` only for focused helpers that reduce correct implementation work;
- optimized glTF 2.0 binary assets (`.glb`) for the room and fictional avatar;
- Motion or a small dedicated scroll-progress adapter to map document progress to a normalized scene timeline;
- Next.js dynamic import for the client-only 3D runtime;
- HTML/CSS outside the canvas for navigation, loading status, accessible descriptions, and calls to action.

The project must not embed Spline, a remote scene editor runtime, or third-party iframe. The renderer must not contact a database, Supabase, authentication service, or analytics endpoint to construct the scene.

The 3D boundary is split into focused units:

- `FullscreenSalonExperience`: owns capability selection, loading, fallback, and HTML overlays.
- `SalonCanvas`: owns renderer configuration, camera, lights, quality tier, and lifecycle cleanup.
- `SalonScene`: composes the room, avatar, portfolio frames, and staged targets.
- `SalonAvatar`: exposes controlled hair, eyebrow, nail, pose, and animation state without reading scroll directly.
- `useSalonScrollTimeline`: maps scroll progress to a typed semantic scene state.
- `SalonFallback`: renders an equivalent lightweight sequence for reduced motion, unsupported WebGL, load failure, or constrained devices.

Scene components consume a normalized state contract rather than coupling camera and material mutations directly to DOM scroll events. This keeps the timeline testable without WebGL.

## 6. Asset pipeline

The room and avatar are created or adapted in a 3D authoring tool and exported as GLB. An AI-generated or marketplace asset is acceptable only when its license explicitly permits commercial web use, modification, and redistribution in the deployed bundle. The repository must record creator/source, license, acquisition date, modifications, and attribution obligations.

External sites may inspire timing, composition, transitions, and interaction patterns. Agents must not copy proprietary code, protected site identity, unlicensed models, textures, animations, or customer imagery.

The asset pipeline must:

1. remove hidden geometry, unused bones, unused animations, materials, and textures;
2. combine or instance repeated room geometry where appropriate;
3. use compressed geometry and web-appropriate texture formats when supported by the verified runtime;
4. limit texture resolution according to visual importance;
5. preserve separate logical variants for hair, eyebrows, and nails;
6. export named animation clips or morph targets with stable identifiers;
7. validate appearance and animation in an independent glTF viewer before React integration;
8. retain editable source files outside the runtime bundle when licensing permits.

The repository stores production-ready assets under `apps/web/public/models/` and records provenance beside the asset inventory. Large editable authoring files are stored only when repository policy and file size allow; otherwise the operational document records their controlled location and backup.

## 7. Portfolio image use

Approved portfolio images may appear as framed artwork, screens, or editorial panels inside the room, or as HTML fallback content. They are not texture sources for the avatar's face, body, hands, hair, eyebrows, or nails.

No existing images may be represented as sequential “before and after” views unless they are verified to depict the same consenting person and comparable framing. Every visible image must retain the existing consent, licensing, responsive loading, and alternative-text requirements.

The 3D scene must not load all portfolio originals at full resolution. The implementation plan defines optimized derivatives or limited selected images for the room and keeps the full portfolio on its dedicated page.

## 8. Responsive quality tiers

Desktop uses the full editorial scene within an explicit performance budget. Mobile uses the same four-act narrative and semantic timeline but a simplified quality tier:

- fewer room objects and lower mesh complexity;
- smaller and fewer textures;
- capped device pixel ratio;
- reduced shadow resolution or shadows disabled;
- fewer lights and no expensive post-processing by default;
- no depth of field, motion blur, screen-space reflections, or continuous particles;
- touch-safe scrolling with no scroll trapping;
- stable camera framing for portrait and landscape orientations.

Quality selection uses capability and measured performance signals, not user-agent strings alone. The application may lower quality during a session but must not oscillate continuously between tiers.

## 9. Loading, failure, and fallbacks

The header and semantic page shell render without waiting for WebGL. The 3D client bundle and GLB assets load progressively. Loading UI shows the Proveras identity, a concise status, and working links to booking and portfolio; it must not present a fake progress percentage unless real byte progress is available.

`prefers-reduced-motion: reduce` bypasses the scroll-driven camera orbit and presents the four service results as a static or manually controlled HTML sequence. The content and links remain equivalent.

If WebGL is unsupported, context creation fails, an asset times out, or the context is lost and cannot recover safely, `SalonFallback` replaces the canvas. The fallback uses approved portfolio imagery and restrained CSS transitions, never a blank region or infinite loader.

The canvas is an enhancement. Search engines, assistive technology, and users without JavaScript still receive a meaningful title, salon description, booking link, portfolio link, and static visual alternative.

## 10. Accessibility and interaction

- The canvas is not the only source of essential content.
- Decorative canvas content is hidden from the accessibility tree; synchronized HTML communicates the active act.
- The fixed header has correct landmarks, focus order, visible focus, adequate contrast, and touch targets.
- Scrolling remains native and keyboard-compatible; the experience does not hijack wheel, touch, Page Up/Down, Home, or End.
- Focus never moves automatically because the camera changes.
- Text overlays do not flash, scramble, or disappear before they can be read.
- Color is never the sole indicator of the highlighted service.
- Motion-sensitive users can reach all destinations without rotation, parallax, or forced transitions.

## 11. Performance budgets and measurement

The implementation plan must establish and verify numeric budgets before production asset creation. At minimum it covers:

- initial route JavaScript before the lazy 3D chunk;
- compressed 3D runtime chunk size;
- total GLB and texture transfer for desktop and mobile tiers;
- Largest Contentful Paint and Interaction to Next Paint on representative mobile hardware;
- sustained animation frame time while scrolling;
- memory use and WebGL context cleanup after navigation;
- no unexpected network request after the scene is cached.

The design target is smooth interaction on representative mid-range mobile hardware, not maximum visual fidelity on a development workstation. If the approved budget and visual fidelity conflict, accessibility, navigation, and booking conversion take priority.

## 12. Testing and verification

Unit tests cover the pure scroll-to-scene mapping, boundary clamping, reverse scrolling, rapid progress changes, quality-tier selection, reduced-motion selection, and fallback decisions.

Component tests cover immediate header availability, loading and failure states, accessible act descriptions, fallback content, and preservation of booking/portfolio navigation without requiring a real WebGL renderer.

Browser verification covers:

- full four-act forward and reverse sequence;
- desktop and mobile quality tiers;
- portrait and landscape layouts;
- light and dark themes;
- reduced motion;
- keyboard and touch scrolling;
- WebGL unavailable and context-loss behavior;
- slow asset loading and failed GLB requests;
- navigation away from and back to the homepage;
- console errors, memory leaks, overflow, layout shift, and performance budgets.

Visual review must compare the implementation with the approved editorial direction and verify that hair, eyebrows, hands, nails, room, and portfolio frames remain understandable at each camera stop.

## 13. Security, privacy, and operational constraints

- No real customer data or biometric inference enters the model-generation or implementation workflow.
- Portfolio images are used only under the project's approved consent rules.
- Model and texture URLs are same-origin production assets unless a separately approved content-delivery design exists.
- Asset metadata and error logs contain no private user data or secrets.
- Third-party asset licenses are reviewed before files enter production.
- The home cannot require authentication or expose session details in the 3D runtime.
- The scene cannot block access to booking, privacy, contact, or portfolio routes.

## 14. Integration and project continuity

The feature is isolated from identity, database, scheduling, and Supabase modules. It consumes only public brand assets, portfolio metadata approved for public display, design tokens, and route constants. No backend contract changes are required.

The future implementation plan must be split so that the basic accessible home shell and fallback are independently deliverable before the 3D runtime. Model creation, runtime integration, scroll choreography, responsive optimization, and final browser verification are separate reviewable tasks. This prevents the experimental 3D work from blocking functional booking development.

## 15. Acceptance criteria

- The home is a fullscreen editorial 3D salon experience below a fixed header.
- Header links to booking and portfolio work before, during, and after scene loading.
- Native scroll deterministically controls the approved four-act sequence.
- The fictional client shows a first hairstyle, eyebrows, nails, and a second hairstyle in that order.
- Desktop and simplified mobile tiers preserve the same narrative.
- Reduced-motion and WebGL failure paths provide equivalent meaningful content.
- The implementation does not identify or reconstruct a real portfolio subject.
- External assets and inspirations have recorded, compatible licenses.
- Portfolio images are used only as approved public presentation content.
- Performance budgets are defined before production asset work and verified before completion.
- The feature remains isolated from authentication, database, scheduling, and Supabase work.
- Phase 2 Task 4 remains the immediate next implementation lot.
