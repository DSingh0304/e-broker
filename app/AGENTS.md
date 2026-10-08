# Frontend Engineering and Design Standards

## 1. Mandatory Skill Usage

Before implementing or significantly modifying a frontend:

1. Check the available skills and load the `frontend-design` skill using OpenCode's skill tool before writing UI code.
2. Before finalizing a frontend, load and apply `web-design-guidelines` to audit the implementation.
3. If either skill is unavailable, continue using these standards and report the missing skill instead of pretending it was loaded.
4. Load additional relevant skills when available, particularly those covering accessibility, UX, component libraries, and interface quality.
5. Do not merely mention a skill in your reasoning. Load its instructions and follow its workflow.

## 2. Design Before Implementation

Before coding, understand the product and its users.

- Identify the target audience, primary user journeys, and most important actions.
- Inspect the existing codebase, framework, dependencies, components, and design conventions.
- Establish a visual direction before implementing the page.
- Choose an intentional design concept appropriate to the product instead of defaulting to a generic AI-generated dashboard.
- For larger features, outline the page structure and key interaction states before implementation.
- Preserve existing architecture and working functionality unless a change is justified.

## 3. Visual Quality

Establish a coherent visual system covering:

- Typography, font hierarchy, line height, and readable text widths.
- A consistent spacing scale and alignment system.
- Backgrounds, foregrounds, accent colors, and semantic colors.
- Borders, radii, shadows, and component density.
- Responsive breakpoints and content widths.
- Iconography, imagery, and meaningful visual details.

Design principles:

- Prioritize strong hierarchy, deliberate whitespace, and clear content organization.
- Use typography, composition, contrast, and proportion to establish visual identity.
- Avoid excessive gradients, unnecessary glassmorphism, random decorative elements, generic hero sections, and repetitive card grids.
- Use animation and transitions only when they improve feedback, orientation, or storytelling.
- Prefer restrained, consistent motion and respect reduced-motion preferences.
- Do not use emoji as a substitute for a coherent icon system.
- Avoid placeholder content and empty decorative sections in production-ready interfaces.

## 4. Components and Frontend Architecture

- Reuse existing project components and established patterns.
- When appropriate, use shadcn/ui and customize its components to match the product's visual identity.
- Prefer semantic HTML and maintainable component boundaries.
- Extract reusable components when repetition or complexity justifies it.
- Use the project's existing styling approach and design tokens before introducing another library.
- Do not install dependencies without a clear need.
- Avoid unnecessary rewrites, unrelated refactors, and changes to existing business logic.
- Implement real interactions rather than decorative controls that do nothing.
- Provide appropriate loading, empty, success, error, disabled, and focus states.

## 5. Documentation and MCP Usage

Use the configured MCP servers when they materially improve implementation quality.

### Context7

- Consult Context7 when framework APIs, component-library usage, configuration, or implementation details may have changed.
- Resolve the relevant library and retrieve documentation before relying on uncertain API details.
- Prefer official documentation and examples compatible with the installed package versions.
- Do not fetch documentation unnecessarily for simple, well-understood tasks.

### Playwright

- Start the application using its existing development command.
- Use Playwright to inspect and interact with the running application when browser tools are available.
- Test primary user journeys, navigation, forms, menus, dialogs, and other important interactions.
- Check browser console errors and failed requests when the available tools expose them.
- Inspect representative desktop and mobile layouts.
- Fix reproducible defects before declaring the task complete.
- If browser testing is unavailable, clearly state what could not be verified.

## 6. Responsive Design and Accessibility

- Build mobile-first or otherwise deliberately responsive layouts.
- Prevent horizontal overflow, clipped content, and overlapping elements.
- Use semantic landmarks, headings, labels, and buttons.
- Ensure keyboard navigation and visible focus indicators.
- Maintain sufficient color contrast.
- Provide meaningful alternative text for informative images.
- Associate form fields with labels and expose validation errors clearly.
- Respect reduced-motion preferences.
- Do not rely on color alone to communicate meaning.

## 7. Implementation Workflow

For substantial frontend tasks, follow this sequence:

1. Inspect the existing codebase and identify the relevant entry points.
2. Load the relevant design skill.
3. Define the visual direction and component strategy.
4. Check current documentation through Context7 when needed.
5. Implement the interface using the existing stack.
6. Run the application's available type checks, linting, and relevant tests.
7. Launch the application and verify it using Playwright when available.
8. Audit the result using `web-design-guidelines`.
9. Fix visual, responsive, accessibility, and interaction defects.
10. Summarize the changes, verification performed, and any remaining limitations.

## 8. Completion Criteria

Do not consider a frontend complete merely because it compiles.

The implementation should:

- Match the intended visual direction.
- Have consistent typography, spacing, and component styling.
- Work across representative viewport sizes.
- Provide functional primary interactions.
- Meet reasonable accessibility expectations.
- Avoid introducing unnecessary dependencies or architectural changes.
- Pass the relevant available checks.
- Have documented testing limitations where verification was not possible.

Prioritize a smaller number of well-executed design decisions over excessive decoration or unnecessary complexity.

## Required Skill Invocation

For frontend implementation or substantial UI redesign tasks:

- Load `frontend-design` before writing UI code.
- Load `shadcn` when building or modifying shadcn/ui components.
- Load `web-design-guidelines` when reviewing or finalizing the interface.
- Use Context7 for current framework and library documentation when needed.
- Use Playwright to test the running application when browser testing is available.

Use the OpenCode skill tool to load each skill by its exact ID.
Do not claim a skill was used unless it was actually loaded.