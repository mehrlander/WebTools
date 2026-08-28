# daisyUI 5
daisyUI 5 is a CSS library for Tailwind CSS 4
daisyUI 5 provides class names for common UI components

- [daisyUI 5 docs](http://daisyui.com)
- [Guide: How to use this file in LLMs and code editors](https://daisyui.com/docs/editor/)
- [daisyUI 5 release notes](https://daisyui.com/docs/v5/)
- [daisyUI 4 to 5 upgrade guide](https://daisyui.com/docs/upgrade/)

## daisyUI 5 install notes
[install guide](https://daisyui.com/docs/install/)
1. daisyUI 5 requires Tailwind CSS 4
2. `tailwind.config.js` file is deprecated in Tailwind CSS v4. do not use `tailwind.config.js`. Tailwind CSS v4 only needs `@import "tailwindcss";` in the CSS file if it's a node dependency.
3. daisyUI 5 can be installed using `npm i -D daisyui@latest` and then adding `@plugin "daisyui";` to the CSS file
4. daisyUI is suggested to be installed as a dependency but if you really want to use it from CDN, you can use Tailwind CSS and daisyUI CDN files:
```html
<link href="https://cdn.jsdelivr.net/npm/daisyui@5" rel="stylesheet" type="text/css" />
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
```
5. A CSS file with Tailwind CSS and daisyUI looks like this (if it's a node dependency)
```css
@import "tailwindcss";
@plugin "daisyui";
```

## daisyUI 5 usage rules
1. We can give styles to a HTML element by adding daisyUI class names to it. By adding a component class name, part class names (if there's any available for that component), and modifier class names (if there's any available for that component)
2. Components can be customized using Tailwind CSS utility classes if the customization is not possible using the existing daisyUI classes. For example `btn px-10` sets a custom horizontal padding to a `btn`
3. If customization of daisyUI styles using Tailwind CSS utility classes didn't work because of CSS specificity issues, you can use the `!` at the end of the Tailwind CSS utility class to override the existing styles. For example `btn bg-red-500!` sets a custom background color to a `btn` forcefully. This is a last resort solution and should be used sparingly
4. If a specific component or something similar to it doesn't exist in daisyUI, you can create your own component using Tailwind CSS utility
5. when using Tailwind CSS `flex` and `grid` for layout, it should be responsive using Tailwind CSS responsive utility prefixes.
6. Only allowed class names are existing daisyUI class names or Tailwind CSS utility classes.
7. Ideally, you won't need to write any custom CSS. Using daisyUI class names or Tailwind CSS utility classes is preferred.
8. suggested - if you need placeholder images, use https://picsum.photos/200/300 with the size you want
9. suggested - when designing , don't add a custom font unless it's necessary
10. don't add `bg-base-100 text-base-content` to body unless it's necessary
11. For design decisions, use Refactoring UI book best practices

daisyUI 5 class names are one of the following categories. These type names are only for reference and are not used in the actual code
- `component`: the required component class
- `part`: a child part of a component
- `style`: sets a specific style to component or part
- `behavior`: changes the behavior of component or part
- `color`: sets a specific color to component or part
- `size`: sets a specific size to component or part
- `placement`: sets a specific placement to component or part
- `direction`: sets a specific direction to component or part
- `modifier`: modifies the component or part in a specific way
- `variant`: prefixes for utility classes that conditionally apply styles. syntax is `variant:utility-class`

## Config
daisyUI 5 config docs: https://daisyui.com/docs/config/
daisyUI without config:
```css
@plugin "daisyui";
```
daisyUI config with `light` theme only:
```css
@plugin "daisyui" {
  themes: light --default;
}
```
daisyUI with all the default configs:
```css
@plugin "daisyui" {
  themes: light --default, dark --prefersdark;
  root: ":root";
  include: ;
  exclude: ;
  prefix: ;
  logs: true;
}
```
An example config:
In below config, all the built-in themes are enabled while bumblebee is the default theme and synthwave is the prefersdark theme (default dark mode)
All the other themes are enabled and can be used by adding `data-theme="THEME_NAME"` to the `<html>` element
root scrollbar gutter is excluded. `daisy-` prefix is used for all daisyUI classes and console.log is disabled
```css
@plugin "daisyui" {
  themes: light, dark, cupcake, bumblebee --default, emerald, corporate, synthwave --prefersdark, retro, cyberpunk, valentine, halloween, garden, forest, aqua, lofi, pastel, fantasy, wireframe, black, luxury, dracula, cmyk, autumn, business, acid, lemonade, night, coffee, winter, dim, nord, sunset, caramellatte, abyss, silk;
  root: ":root";
  include: ;
  exclude: rootscrollgutter, checkbox;
  prefix: daisy-;
  logs: false;
}
```
## daisyUI 5 colors

### daisyUI color names
- `primary`: Primary brand color, The main color of your brand
- `primary-content`: Foreground content color to use on primary color
- `secondary`: Secondary brand color, The optional, secondary color of your brand
- `secondary-content`: Foreground content color to use on secondary color
- `accent`: Accent brand color, The optional, accent color of your brand
- `accent-content`: Foreground content color to use on accent color
- `neutral`: Neutral dark color, For not-saturated parts of UI
- `neutral-content`: Foreground content color to use on neutral color
- `base-100`:-100 Base surface color of page, used for blank backgrounds
- `base-200`:-200 Base color, darker shade, to create elevations
- `base-300`:-300 Base color, even more darker shade, to create elevations
- `base-content`: Foreground content color to use on base color
- `info`: Info color, For informative/helpful messages
- `info-content`: Foreground content color to use on info color
- `success`: Success color, For success/safe messages
- `success-content`: Foreground content color to use on success color
- `warning`: Warning color, For warning/caution messages
- `warning-content`: Foreground content color to use on warning color
- `error`: Error color, For error/danger/destructive messages
- `error-content`: Foreground content color to use on error color

### daisyUI color rules
1. daisyUI adds semantic color names to Tailwind CSS colors
2. daisyUI color names can be used in utility classes, like other Tailwind CSS color names. for example, `bg-primary` will use the primary color for the background
3. daisyUI color names include variables as value so they can change based the theme
4. There's no need to use `dark:` for daisyUI color names
5. Ideally only daisyUI color names should be used for colors so the colors can change automatically based on the theme
6. If a Tailwind CSS color name (like `red-500`) is used, it will be same red color on all themes
7. If a daisyUI color name (like `primary`) is used, it will change color based on the theme
8. Using Tailwind CSS color names for text colors should be avoided because Tailwind CSS color `text-gray-800` on `bg-base-100` would be unreadable on a dark theme - because on dark theme, `bg-base-100` is a dark color
9. `*-content` colors should have a good contrast compared to their associated colors
10. suggestion - when designing a page use `base-*` colors for majority of the page. use `primary` color for important elements

### daisyUI custom theme with custom colors
A CSS file with Tailwind CSS, daisyUI and a custom daisyUI theme looks like this:
```css
@import "tailwindcss";
@plugin "daisyui";
@plugin "daisyui/theme" {
  name: "mytheme";
  default: true; /* set as default */
  prefersdark: false; /* set as default dark mode (prefers-color-scheme:dark) */
  color-scheme: light; /* color of browser-provided UI */

  --color-base-100: oklch(98% 0.02 240);
  --color-base-200: oklch(95% 0.03 240);
  --color-base-300: oklch(92% 0.04 240);
  --color-base-content: oklch(20% 0.05 240);
  --color-primary: oklch(55% 0.3 240);
  --color-primary-content: oklch(98% 0.01 240);
  --color-secondary: oklch(70% 0.25 200);
  --color-secondary-content: oklch(98% 0.01 200);
  --color-accent: oklch(65% 0.25 160);
  --color-accent-content: oklch(98% 0.01 160);
  --color-neutral: oklch(50% 0.05 240);
  --color-neutral-content: oklch(98% 0.01 240);
  --color-info: oklch(70% 0.2 220);
  --color-info-content: oklch(98% 0.01 220);
  --color-success: oklch(65% 0.25 140);
  --color-success-content: oklch(98% 0.01 140);
  --color-warning: oklch(80% 0.25 80);
  --color-warning-content: oklch(20% 0.05 80);
  --color-error: oklch(65% 0.3 30);
  --color-error-content: oklch(98% 0.01 30);

  --radius-selector: 1rem; /* border radius of selectors (checkbox, toggle, badge) */
  --radius-field: 0.25rem; /* border radius of fields (button, input, select, tab) */
  --radius-box: 0.5rem; /* border radius of boxes (card, modal, alert) */
  /* preferred values for --radius-* : 0rem, 0.25rem, 0.5rem, 1rem, 2rem */

  --size-selector: 0.25rem; /* base size of selectors (checkbox, toggle, badge). Value must be 0.25rem unless we intentionally want bigger selectors. In so it can be 0.28125 or 0.3125. If we intentionally want smaller selectors, it can be 0.21875 or 0.1875 */
  --size-field: 0.25rem; /* base size of fields (button, input, select, tab). Value must be 0.25rem unless we intentionally want bigger fields. In so it can be 0.28125 or 0.3125. If we intentionally want smaller fields, it can be 0.21875 or 0.1875 */

  --border: 1px; /* border size. Value must be 1px unless we intentionally want thicker borders. In so it can be 1.5px or 2px. If we intentionally want thinner borders, it can be 0.5px */

  --depth: 1; /* only 0 or 1 – Adds a shadow and subtle 3D depth effect to components */
  --noise: 0; /* only 0 or 1 - Adds a subtle noise (grain) effect to components */
}
```
#### Rules
- All CSS variables above are required
- Colors can be OKLCH or hex or other formats
- If you're generating a custom theme, do not include the comments from the example above. Just provide the code.

People can use https://daisyui.com/theme-generator/ visual tool to create their own theme.

## daisyUI 5 components

### accordion
Accordion is used for showing and hiding content but only one item can stay open at a time

[accordion docs](https://daisyui.com/components/accordion/)

#### Class names
- component: `collapse`
- part: `collapse-title`, `collapse-content`
- modifier: `collapse-arrow`, `collapse-plus`, `collapse-open`, `collapse-close`

#### Syntax
```html
<div class="collapse {MODIFIER}">{CONTENT}</div>
```
where content is:
```html
<input type="radio" name="{name}" checked="{checked}" />
<div class="collapse-title">{title}</div>
<div class="collapse-content">{CONTENT}</div>
```

#### Rules
- {MODIFIER} is optional and can have one of the modifier class names
- Accordion uses radio inputs. All radio inputs with the same name work together and only one of them can be open at a time
- If you have more than one set of accordion items on a page, use different names for the radio inputs on each set
- Replace {name} with a unique name for the accordion group
- replace `{checked}` with `checked="checked"` if you want the accordion to be open by default

### alert
Alert informs users about important events

[alert docs](https://daisyui.com/components/alert/)

#### Class names
- component: `alert`
- style: `alert-outline`, `alert-dash`, `alert-soft`
- color: `alert-info`, `alert-success`, `alert-warning`, `alert-error`
- direction: `alert-vertical`, `alert-horizontal`

#### Syntax
```html
<div role="alert" class="alert {MODIFIER}">{CONTENT}</div>
```

#### Rules
- {MODIFIER} is optional and can have one of each style/color/direction class names
- Add `sm:alert-horizontal` for responsive layouts

### avatar
Avatars are used to show a thumbnail

[avatar docs](https://daisyui.com/components/avatar/)

#### Class names
- component: `avatar`, `avatar-group`
- modifier: `avatar-online`, `avatar-offline`, `avatar-placeholder`

#### Syntax
```html
<div class="avatar {MODIFIER}">
  <div>
    <img src="{image-url}" />
  </div>
</div>
```

#### Rules
- {MODIFIER} is optional and can have one of the modifier class names
- Use `avatar-group` for containing multiple avatars
- You can set custom sizes using `w-*` and `h-*`
- You can use mask classes such as `mask-squircle`, `mask-hexagon`, `mask-triangle`

### badge
Badges are used to inform the user of the status of specific data

[badge docs](https://daisyui.com/components/badge/)

#### Class names
- component: `badge`
- style: `badge-outline`, `badge-dash`, `badge-soft`, `badge-ghost`
- color: `badge-neutral`, `badge-primary`, `badge-secondary`, `badge-accent`, `badge-info`, `badge-success`, `badge-warning`, `badge-error`
- size: `badge-xs`, `badge-sm`, `badge-md`, `badge-lg`, `badge-xl`

#### Syntax
```html
<span class="badge {MODIFIER}">Badge</span>
```

#### Rules
- {MODIFIER} is optional and can have one of each style/color/size class names
- Can be used inside text or buttons
- To create an empty badge, just remove the text between the span tags

### breadcrumbs
Breadcrumbs helps users to navigate

[breadcrumbs docs](https://daisyui.com/components/breadcrumbs/)

#### Class names
- component: `breadcrumbs`

#### Syntax
```html
<div class="breadcrumbs">
  <ul><li><a>Link</a></li></ul>
</div>
```

#### Rules
- breadcrumbs only has one main class name
- Can contain icons inside the links
- If you set `max-width` or the list gets larger than the container it will scroll

### button
Buttons allow the user to take actions

[button docs](https://daisyui.com/components/button/)

#### Class names
- component: `btn`
- color: `btn-neutral`, `btn-primary`, `btn-secondary`, `btn-accent`, `btn-info`, `btn-success`, `btn-warning`, `btn-error`
- style: `btn-outline`, `btn-dash`, `btn-soft`, `btn-ghost`, `btn-link`
- behavior: `btn-active`, `btn-disabled`
- size: `btn-xs`, `btn-sm`, `btn-md`, `btn-lg`, `btn-xl`
- modifier: `btn-wide`, `btn-block`, `btn-square`, `btn-circle`

#### Syntax
```html
<button class="btn {MODIFIER}">Button</button>
```
#### Rules
- {MODIFIER} is optional and can have one of each color/style/behavior/size/modifier class names
- btn can be used on any html tags such as `<button>`, `<a>`, `<input>`
- btn can have an icon before or after the text
- set `tabindex="-1" role="button" aria-disabled="true"` if you want to disable the button using a class name

### card
Cards are used to group and display content

[card docs](https://daisyui.com/components/card/)

#### Class names
- component: `card`
- part: `card-title`, `card-body`, `card-actions`
- style: `card-border`, `card-dash`
- modifier: `card-side`, `image-full`
- size: `card-xs`, `card-sm`, `card-md`, `card-lg`, `card-xl`

#### Syntax
```html
<div class="card {MODIFIER}">
  <figure><img src="{image-url}" alt="{alt-text}" /></figure>
  <div class="card-body">
    <h2 class="card-title">{title}</h2>
    <p>{CONTENT}</p>
    <div class="card-actions">{actions}</div>
  </div>
</div>
```

#### Rules
- {MODIFIER} is optional and can have one of the modifier class names and one of the size class names
- `<figure>` and `<div class="card-body">` are optional
- can use `sm:card-horizontal` for responsive layouts
- If image is placed after `card-body`, the image will be placed at the bottom

### carousel
Carousel show images or content in a scrollable area

[carousel docs](https://daisyui.com/components/carousel/)

#### Class names
- component: `carousel`
- part: `carousel-item`
- modifier: `carousel-start`, `carousel-center`, `carousel-end`
- direction: `carousel-horizontal`, `carousel-vertical`

#### Syntax
```html
<div class="carousel {MODIFIER}">{CONTENT}</div>
```

#### Rules
- {MODIFIER} is optional and can have one of the modifier/direction class names
- Content is a list of `carousel-item` divs: `<div class="carousel-item"></div>`
- To create a full-width carousel, add `w-full` to each carousel item

### checkbox
Checkboxes are used to select or deselect a value

[checkbox docs](https://daisyui.com/components/checkbox/)

#### Class names
- component: `checkbox`
- color: `checkbox-primary`, `checkbox-secondary`, `checkbox-accent`, `checkbox-neutral`, `checkbox-success`, `checkbox-warning`, `checkbox-info`, `checkbox-error`
- size: `checkbox-xs`, `checkbox-sm`, `checkbox-md`, `checkbox-lg`, `checkbox-xl`

#### Syntax
```html
<input type="checkbox" class="checkbox {MODIFIER}" />
```

#### Rules
- {MODIFIER} is optional and can have one of each color/size class names

### collapse
Collapse is used for showing and hiding content

[collapse docs](https://daisyui.com/components/collapse/)

#### Class names
- component: `collapse`
- part: `collapse-title`, `collapse-content`
- modifier: `collapse-arrow`, `collapse-plus`, `collapse-open`, `collapse-close`

#### Syntax
```html
<div tabindex="0" class="collapse {MODIFIER}">
  <div class="collapse-title">{title}</div>
  <div class="collapse-content">{CONTENT}</div>
</div>
```

#### Rules
- {MODIFIER} is optional and can have one of the modifier class names
- instead of `tabindex="0"`, you can use  `<input type="checkbox">` as a first child
- Can also be a details/summary tag

### divider
Divider will be used to separate content vertically or horizontally

[divider docs](https://daisyui.com/components/divider/)

#### Class names
- component: `divider`
- color: `divider-neutral`, `divider-primary`, `divider-secondary`, `divider-accent`, `divider-success`, `divider-warning`, `divider-info`, `divider-error`
- direction: `divider-vertical`, `divider-horizontal`
- placement: `divider-start`, `divider-end`

#### Syntax
```html
<div class="divider {MODIFIER}">{text}</div>
```

#### Rules
- {MODIFIER} is optional and can have one of each direction/color/placement class names
- Omit text for a blank divider

### drawer
Drawer is a grid layout that can show/hide a sidebar on the left or right side of the page

[drawer docs](https://daisyui.com/components/drawer/)

#### Class names
- component: `drawer`
- part: `drawer-toggle`, `drawer-content`, `drawer-side`, `drawer-overlay`
- placement: `drawer-end`
- modifier: `drawer-open`
- variant: `is-drawer-open:`, `is-drawer-close:`

#### Syntax
```html
<div class="drawer {MODIFIER}">
  <input id="my-drawer" type="checkbox" class="drawer-toggle" />
  <div class="drawer-content">{CONTENT}</div>
  <div class="drawer-side">{SIDEBAR}</div>
</div>
```

#### Rules
- {MODIFIER} is optional and can have one of the modifier/placement class names
- `id` is required for the `drawer-toggle` input. change `my-drawer` to a unique id according to your needs
- `lg:drawer-open` can be used to make sidebar visible on larger screens
- `drawer-toggle` is a hidden checkbox. Use label with "for" attribute to toggle state
- when using drawer, every page content must be inside `drawer-content` element

### dropdown
Dropdown can open a menu or any other element when the button is clicked

[dropdown docs](https://daisyui.com/components/dropdown/)

#### Class names
- component: `dropdown`
- part: `dropdown-content`
- placement: `dropdown-start`, `dropdown-center`, `dropdown-end`, `dropdown-top`, `dropdown-bottom`, `dropdown-left`, `dropdown-right`
- modifier: `dropdown-hover`, `dropdown-open`, `dropdown-close`

#### Syntax
Using details and summary
```html
<details class="dropdown">
  <summary>Button</summary>
  <ul class="dropdown-content">{CONTENT}</ul>
</details>
```

Using CSS focus
```html
<div class="dropdown">
  <div tabindex="0" role="button">Button</div>
  <ul tabindex="-1" class="dropdown-content">{CONTENT}</ul>
</div>
```

#### Rules
- {MODIFIER} is optional and can have one of the modifier/placement class names
- For CSS focus dropdowns, use `tabindex="0"` and `role="button"` on the button
- The content can be any HTML element (not just `<ul>`)

### input
Text Input is a simple input field

[input docs](https://daisyui.com/components/input/)

#### Class names
- component: `input`
- style: `input-ghost`
- color: `input-neutral`, `input-primary`, `input-secondary`, `input-accent`, `input-info`, `input-success`, `input-warning`, `input-error`
- size: `input-xs`, `input-sm`, `input-md`, `input-lg`, `input-xl`

#### Syntax
```html
<input type="{type}" placeholder="Type here" class="input {MODIFIER}" />
```

#### Rules
- {MODIFIER} is optional and can have one of each style/color/size class names
- Can be used with any input field type (text, password, email, etc.)

### join
Join is a container for grouping multiple items, it can be used to group buttons, inputs, etc.

[join docs](https://daisyui.com/components/join/)

#### Class names
- component: `join`, `join-item`
- direction: `join-vertical`, `join-horizontal`

#### Syntax
```html
<div class="join {MODIFIER}">{CONTENT}</div>
```

#### Rules
- {MODIFIER} is optional and can have one of the direction class names
- Any direct child of the join element will get joined together

### loading
Loading shows an animation to indicate that something is loading

[loading docs](https://daisyui.com/components/loading/)

#### Class names
- component: `loading`
- style: `loading-spinner`, `loading-dots`, `loading-ring`, `loading-ball`, `loading-bars`, `loading-infinity`
- size: `loading-xs`, `loading-sm`, `loading-md`, `loading-lg`, `loading-xl`

#### Syntax
```html
<span class="loading {MODIFIER}"></span>
```

#### Rules
- {MODIFIER} is optional and can have one of the style/size class names

### menu
Menu is used to display a list of links vertically or horizontally

[menu docs](https://daisyui.com/components/menu/)

#### Class names
- component: `menu`
- part: `menu-title`, `menu-dropdown`, `menu-dropdown-toggle`
- modifier: `menu-disabled`, `menu-active`, `menu-focus`, `menu-dropdown-show`
- size: `menu-xs`, `menu-sm`, `menu-md`, `menu-lg`, `menu-xl`
- direction: `menu-vertical`, `menu-horizontal`

#### Syntax
```html
<ul class="menu">
  <li><button>Item</button></li>
</ul>
```

#### Rules
- {MODIFIER} is optional and can have one of the modifier/size/direction class names
- Use `lg:menu-horizontal` for responsive layouts
- Use `menu-title` for list item title

### modal
Modal is used to show a dialog or a box when you click a button

[modal docs](https://daisyui.com/components/modal/)

#### Class names
- component: `modal`
- part: `modal-box`, `modal-action`, `modal-backdrop`, `modal-toggle`
- modifier: `modal-open`
- placement: `modal-top`, `modal-middle`, `modal-bottom`, `modal-start`, `modal-end`

#### Syntax
Using HTML dialog element
```html
<button onclick="my_modal.showModal()">Open modal</button>
<dialog id="my_modal" class="modal">
  <div class="modal-box">{CONTENT}</div>
  <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
```

#### Rules
- {MODIFIER} is optional and can have one of the modifier/placement class names
- Use unique IDs for each modal
- For HTML dialog element modals, add `<form method="dialog">` for closing the modal with submit

### navbar
Navbar is used to show a navigation bar on the top of the page

[navbar docs](https://daisyui.com/components/navbar/)

#### Class names
- component: `navbar`
- part: `navbar-start`, `navbar-center`, `navbar-end`

#### Syntax
```html
<div class="navbar">{CONTENT}</div>
```

#### Rules
- use `navbar-start`, `navbar-center`, `navbar-end` to position content horizontally
- suggestion - use `base-200` for background color

### progress
Progress bar can be used to show the progress of a task

[progress docs](https://daisyui.com/components/progress/)

#### Class names
- component: `progress`
- color: `progress-neutral`, `progress-primary`, `progress-secondary`, `progress-accent`, `progress-info`, `progress-success`, `progress-warning`, `progress-error`

#### Syntax
```html
<progress class="progress {MODIFIER}" value="50" max="100"></progress>
```

#### Rules
- {MODIFIER} is optional and can have one of the color class names
- You must specify value and max attributes

### radio
Radio buttons allow the user to select one option

[radio docs](https://daisyui.com/components/radio/)

#### Class names
- component: `radio`
- color: `radio-neutral`, `radio-primary`, `radio-secondary`, `radio-accent`, `radio-success`, `radio-warning`, `radio-info`, `radio-error`
- size: `radio-xs`, `radio-sm`, `radio-md`, `radio-lg`, `radio-xl`

#### Syntax
```html
<input type="radio" name="{name}" class="radio {MODIFIER}" />
```

#### Rules
- {MODIFIER} is optional and can have one of the size/color class names
- Replace {name} with a unique name for the radio group

### range
Range slider is used to select a value by sliding a handle

[range docs](https://daisyui.com/components/range/)

#### Class names
- component: `range`
- color: `range-neutral`, `range-primary`, `range-secondary`, `range-accent`, `range-success`, `range-warning`, `range-info`, `range-error`
- size: `range-xs`, `range-sm`, `range-md`, `range-lg`, `range-xl`

#### Syntax
```html
<input type="range" min="0" max="100" value="40" class="range {MODIFIER}" />
```

#### Rules
- {MODIFIER} is optional and can have one of each color/size class names
- You must specify `min` and `max` attributes

### select
Select is used to pick a value from a list of options

[select docs](https://daisyui.com/components/select/)

#### Class names
- component: `select`
- style: `select-ghost`
- color: `select-neutral`, `select-primary`, `select-secondary`, `select-accent`, `select-info`, `select-success`, `select-warning`, `select-error`
- size: `select-xs`, `select-sm`, `select-md`, `select-lg`, `select-xl`

#### Syntax
```html
<select class="select {MODIFIER}">
  <option>Option</option>
</select>
```

#### Rules
- {MODIFIER} is optional and can have one of each style/color/size class names

### stats
Stat is used to show numbers and data in a block

[stat docs](https://daisyui.com/components/stat/)

#### Class names
- Component: `stats`
- Part: `stat`, `stat-title`, `stat-value`, `stat-desc`, `stat-figure`, `stat-actions`
- Direction: `stats-horizontal`, `stats-vertical`

#### Syntax
```html
<div class="stats {MODIFIER}">
  <div class="stat">{CONTENT}</div>
</div>
```

#### Rules
- {MODIFIER} is optional and can have one of the direction class names
- Content includes `stat-title`, `stat-value`, `stat-desc` inside a `stat`

### steps
Steps can be used to show a list of steps in a process

[steps docs](https://daisyui.com/components/steps/)

#### Class Names:
- Component: `steps`
- Part: `step`, `step-icon`
- Color: `step-neutral`, `step-primary`, `step-secondary`, `step-accent`, `step-info`, `step-success`, `step-warning`, `step-error`
- Direction: `steps-vertical`, `steps-horizontal`

#### Syntax
```html
<ul class="steps {MODIFIER}">
  <li class="step">{step content}</li>
</ul>
```

#### Rules
- {MODIFIER} is optional and can have one of each direction/color class names
- To make a step active, add the `step-primary` class

### swap
Swap allows you to toggle the visibility of two elements

[swap docs](https://daisyui.com/components/swap/)

#### Class Names:
- Component: `swap`
- Part: `swap-on`, `swap-off`, `swap-indeterminate`
- Modifier: `swap-active`
- Style: `swap-rotate`, `swap-flip`

#### Syntax
```html
<label class="swap {MODIFIER}">
  <input type="checkbox" />
  <div class="swap-on">{content when active}</div>
  <div class="swap-off">{content when inactive}</div>
</label>
```

#### Rules
- {MODIFIER} is optional and can have one of the modifier/style class names
- Use only a hidden checkbox to control swap state

### tab
Tabs can be used to show a list of links in a tabbed format

[tab docs](https://daisyui.com/components/tab/)

#### Class Names:
- Component: `tabs`
- Part: `tab`, `tab-content`
- Style: `tabs-box`, `tabs-border`, `tabs-lift`
- Modifier: `tab-active`, `tab-disabled`
- Placement: `tabs-top`, `tabs-bottom`

#### Syntax
```html
<div role="tablist" class="tabs {MODIFIER}">
  <button role="tab" class="tab">Tab</button>
</div>
```

#### Rules
- {MODIFIER} is optional and can have one of the style/size class names
- Radio inputs are needed for tab content to work with tab click

### table
Table can be used to show a list of data in a table format

[table docs](https://daisyui.com/components/table/)

#### Class Names:
- Component: `table`
- Modifier: `table-zebra`, `table-pin-rows`, `table-pin-cols`
- Size: `table-xs`, `table-sm`, `table-md`, `table-lg`, `table-xl`

#### Syntax
```html
<div class="overflow-x-auto">
  <table class="table {MODIFIER}">
    <thead><tr><th></th></tr></thead>
    <tbody><tr><th></th></tr></tbody>
  </table>
</div>
```

#### Rules
- {MODIFIER} is optional and can have one of each modifier/size class names
- The `overflow-x-auto` class is added to the wrapper div to make the table horizontally scrollable

### textarea
Textarea allows users to enter text in multiple lines

[textarea docs](https://daisyui.com/components/textarea/)

#### Class Names:
- Component: `textarea`
- Style: `textarea-ghost`
- Color: `textarea-neutral`, `textarea-primary`, `textarea-secondary`, `textarea-accent`, `textarea-info`, `textarea-success`, `textarea-warning`, `textarea-error`
- Size: `textarea-xs`, `textarea-sm`, `textarea-md`, `textarea-lg`, `textarea-xl`

#### Syntax
```html
<textarea class="textarea {MODIFIER}" placeholder="Bio"></textarea>
```

#### Rules
- {MODIFIER} is optional and can have one of each style/color/size class names

### toast
Toast is a wrapper to stack elements, positioned on the corner of page

[toast docs](https://daisyui.com/components/toast/)

#### Class Names:
- Component: `toast`
- Placement: `toast-start`, `toast-center`, `toast-end`, `toast-top`, `toast-middle`, `toast-bottom`

#### Syntax
```html
<div class="toast {MODIFIER}">{CONTENT}</div>
```

#### Rules
- {MODIFIER} is optional and can have one of the placement class names

### toggle
Toggle is a checkbox that is styled to look like a switch button

[toggle docs](https://daisyui.com/components/toggle/)

#### Class Names:
- Component: `toggle`
- Color: `toggle-primary`, `toggle-secondary`, `toggle-accent`, `toggle-neutral`, `toggle-success`, `toggle-warning`, `toggle-info`, `toggle-error`
- Size: `toggle-xs`, `toggle-sm`, `toggle-md`, `toggle-lg`, `toggle-xl`

#### Syntax
```html
<input type="checkbox" class="toggle {MODIFIER}" />
```

#### Rules
- {MODIFIER} is optional and can have one of each color/size class names

### tooltip
Tooltip can be used to show a message when hovering over an element

[tooltip docs](https://daisyui.com/components/tooltip/)

#### Class Names:
- Component: `tooltip`
- Placement: `tooltip-top`, `tooltip-bottom`, `tooltip-left`, `tooltip-right`
- Color: `tooltip-primary`, `tooltip-secondary`, `tooltip-accent`, `tooltip-info`, `tooltip-success`, `tooltip-warning`, `tooltip-error`
- Modifier: `tooltip-open`

#### Syntax
```html
<div class="tooltip {MODIFIER}" data-tip="tooltip text">
  <button>Hover me</button>
</div>
```

#### Rules
- {MODIFIER} is optional and can have one of each placement/color class names
- Use `data-tip` attribute to set the tooltip text
- **House style overrides this component: do not use it.** (Added here, not
  upstream.) It is CSS `:hover` only, so on a touch screen the first tap sticks
  it open and only a tap somewhere else clears it, and nothing inside it can be
  tapped. Build the panel instead: House style rule 7 in `SKILL.md`.
