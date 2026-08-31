---
name: phosphor-icons
description: Selecting and using Phosphor Icons in web projects. Use this skill whenever creating HTML artifacts, web UIs, dashboards, or browser-based tools that need icons, even if icons aren't explicitly requested. Also use when the user asks "what icon should I use for X" or needs to find the right icon name. Phosphor is the default icon library; always prefer it over inline SVGs, Font Awesome, Heroicons, or Lucide.
---

# Phosphor Icons

## Usage

Load via jsDelivr (typically combined with other deps):
```html
<script src="https://cdn.jsdelivr.net/combine/npm/@tailwindcss/browser@4,npm/@phosphor-icons/web"></script>
```

Syntax: `<i class="{weight} ph-{name}"></i>`

Weights: `ph` (regular), `ph-bold`, `ph-fill`, `ph-duotone`, `ph-light`, `ph-thin`. Pick one weight per project. `ph-bold` is a good UI default.

Icons inherit `font-size` and `color`, so Tailwind utilities work directly:
```html
<i class="ph-bold ph-check text-success text-xl"></i>
```

## A wrong name renders as nothing

There is no fallback glyph and no console error. The class resolves to a
`:before` rule keyed by the name, so a name the font does not carry leaves a
zero-width blank: the element is present, sized, and empty. That reads as a
logic bug and gets debugged as one, so measure the element's width before
suspecting the state that controls it.

Two ways to get there, and only the first is recoverable by machine:

- **A weight used as a suffix.** `ph-play-fill` is not a name; weights are font
  families, so it is `ph-fill ph-play`.
- **A name from another icon family.** Octicons has `git-compare` and `repo`,
  Font Awesome has `arrow-down-to-bracket`, and all three are plausible enough
  to type. Check the manifest below rather than trusting recall.

In web-tools, `npm run icon-scan` ([`scripts/blank-icons.py`](https://github.com/mehrlander/web-tools/blob/main/scripts/blank-icons.py))
resolves every `ph-` name in the tree against the installed stylesheet and the
suite gates it. Elsewhere, the same check is a grep against
`node_modules/@phosphor-icons/web/src/regular/style.css`.

## Icon Manifest

Three categories determine what class names are valid.

### 1. STANDALONE ATOMS
Only `ph-{root}` is valid. No suffixes exist.

acorn, activity, airplay, alarm, alien, ambulance, angle, aperture, armchair, asclepius, at, atom, avocado, axe, backpack, backspace, balloon, bandaids, bank, barbell, barcode, barn, barricade, basket, basketball, bathtub, beanie, bed, belt, bicycle, binary, binoculars, biohazard, bird, blueprint, boat, bomb, bone, books, boot, boules, brain, brandy, bread, bridge, broadcast, broom, browser, browsers, buildings, bulldozer, bus, butterfly, cactus, caduceus, cake, calculator, campfire, cardholder, carrot, cat, certificate, chair, champagne, checkerboard, checks, cheers, cheese, cherries, church, circuitry, city, clover, club, coins, command, confetti, control, cookie, copyleft, copyright, couch, cow, cpu, cricket, crop, cross, cylinder, database, desk, detective, devices, diamond, disc, divide, dna, dog, dress, dresser, drone, elevator, empty, engine, equalizer, equals, eraser, exam, export, eyeglasses, eyes, factory, fan, farm, feather, files, flame, flashlight, flask, folders, footprints, function, garage, gauge, gavel, ghost, gif, gift, goggles, golf, gradient, graph, guitar, hamburger, hammer, handshake, headlights, headphones, headset, heartbeat, hexagon, hockey, hoodie, horse, hospital, hurricane, infinity, info, intersection, invoice, island, jeep, joystick, kanban, keyboard, keyhole, knife, laptop, lasso, layout, leaf, lectern, lemniscate, lifebuoy, lighthouse, lockers, log, mailbox, martini, memory, meteor, metronome, microscope, mosque, motorcycle, mountains, needle, notches, notebook, notepad, notification, numpad, nut, octagon, onigiri, option, oven, package, palette, panorama, pants, parachute, paragraph, parallelogram, park, password, path, peace, pentagon, pentagram, pepper, percent, perspective, pi, pill, pinwheel, pizza, placeholder, planet, plant, playlist, polygon, popcorn, popsicle, power, prescription, printer, pulse, queue, quotes, rabbit, racquet, radical, radioactive, ranking, record, recycle, resize, robot, rug, ruler, sailboat, scales, scissors, scooter, screencast, screwdriver, scroll, seat, seatbelt, shapes, shovel, shower, shrimp, sigma, signature, signpost, siren, skull, slideshow, snowflake, sock, spade, sparkle, speedometer, sphere, spiral, stairs, stamp, steps, stethoscope, sticker, stool, storefront, strategy, student, subway, sunglasses, swap, swatches, sword, synagogue, syringe, table, tabs, target, taxi, tent, textbox, ticket, tilde, timer, tipi, tire, toolbox, tooth, tornado, towel, tractor, tram, translate, trophy, union, usb, van, vault, vibrate, vignette, virus, visor, voicemail, volleyball, wall, wallet, warehouse, watch, waves, wind, windmill, wine, wrench, yarn

### 2. INDEPENDENT ROOTS
`ph-{root}` is valid, plus the listed suffixes.

#### Shared suffix groups
- **[simple]**: anchor, asterisk, bag, bookmark, bookmarks, copy, crosshair, download, eject, fingerprint, fish, handbag, ladder, megaphone, rss, sidebar, television, tote, trash, umbrella, upload
- **[slash]**: cigarette, ear, grains, subtitles, waveform, webcam
- **[square]**: exclude, images, subtract, unite
- **[circle]**: highlighter, pause, rewind, stop
- **[horizontal]**: faders, paperclip, sliders
- **[tower]**: crane, desktop
- **[straight]**: hash, magnet
- **[smiley]**: lego, scan
- **[dashed]**: rectangle, triangle

#### Individual roots with suffixes
- **airplane**: in-flight, landing, takeoff, taxiing, tilt
- **archive**: box, tray
- **article**: medium, ny-times
- **baby**: carriage
- **baseball**: cap, helmet
- **bell**: ringing, simple, simple-ringing, simple-slash, simple-z, slash, z
- **bluetooth**: connected, slash, x
- **book**: bookmark, open, open-text, open-user
- **briefcase**: metal
- **bug**: beetle, droid
- **building**: apartment, office
- **calendar**: blank, check, dot, dots, heart, minus, plus, slash, star, x
- **camera**: plus, rotate, slash
- **car**: battery, profile, simple
- **cards**: three
- **chalkboard**: simple, teacher
- **chat**: centered, centered-dots, centered-slash, centered-text, circle, circle-dots, circle-slash, circle-text, dots, slash, teardrop, teardrop-dots, teardrop-slash, teardrop-text, text
- **chats**: circle, teardrop
- **check**: circle, fat, square, square-offset
- **circle**: dashed, half, half-tilt, notch, wavy, wavy-check, wavy-question, wavy-warning
- **clipboard**: text
- **clock**: afternoon, clockwise, countdown, counter-clockwise, user
- **cloud**: arrow-down, arrow-up, check, fog, lightning, moon, rain, slash, snow, sun, warning, x
- **code**: block, simple
- **coffee**: bean
- **coin**: vertical
- **columns**: plus-left, plus-right
- **compass**: rose, tool
- **crown**: cross, simple
- **cube**: focus, transparent
- **cursor**: click, text
- **door**: open
- **dot**: outline
- **drop**: half, half-bottom, simple, slash
- **egg**: crack
- **envelope**: open, simple, simple-open
- **eye**: closed, slash
- **eyedropper**: sample
- **file**: archive, arrow-down, arrow-up, audio, c, c-sharp, cloud, code, cpp, css, csv, dashed, doc, dotted, html, image, ini, jpg, js, jsx, lock, magnifying-glass, md, minus, pdf, plus, png, ppt, py, rs, search, sql, svg, text, ts, tsx, txt, video, vue, x, xls, zip
- **fire**: extinguisher, simple, truck
- **flag**: banner, banner-fold, checkered, pennant
- **flower**: lotus, tulip
- **folder**: dashed, dotted, lock, minus, notch, notch-minus, notch-open, notch-plus, open, plus, simple, simple-dashed, simple-dotted, simple-lock, simple-minus, simple-plus, simple-star, simple-user, star, user
- **football**: helmet
- **funnel**: simple, simple-x, x
- **gear**: fine, six
- **globe**: hemisphere-east, hemisphere-west, simple, simple-x, stand, x
- **gps**: fix, slash
- **hand**: arrow-down, arrow-up, coins, deposit, eye, fist, grabbing, heart, palm, peace, pointing, soap, swipe-left, swipe-right, tap, waving, withdraw
- **heart**: break, half, straight, straight-break
- **hourglass**: high, low, medium, simple, simple-high, simple-low, simple-medium
- **house**: line, simple
- **image**: broken, square
- **intersect**: square, three
- **jar**: label
- **key**: return
- **lamp**: pendant
- **lightbulb**: filament
- **lightning**: a, slash
- **link**: break, simple, simple-break, simple-horizontal, simple-horizontal-break
- **list**: bullets, checks, dashes, heart, magnifying-glass, numbers, plus, star
- **lock**: key, key-open, laminated, laminated-open, open, simple, simple-open
- **medal**: military
- **microphone**: slash, stage
- **minus**: circle, square
- **money**: wavy
- **monitor**: arrow-up, play
- **moon**: stars
- **moped**: front
- **mouse**: left-click, middle-click, right-click, scroll, simple
- **network**: slash, x
- **newspaper**: clipping
- **note**: blank, pencil
- **orange**: slice
- **pen**: nib, nib-straight
- **pencil**: circle, line, ruler, simple, simple-line, simple-slash, slash
- **person**: arms-spread, simple, simple-bike, simple-circle, simple-hike, simple-run, simple-ski, simple-snowboard, simple-swim, simple-tai-chi, simple-throw, simple-walk
- **phone**: call, disconnect, incoming, list, outgoing, pause, plus, slash, transfer, x
- **pipe**: wrench
- **play**: circle, pause
- **plug**: charging
- **plugs**: connected
- **plus**: circle, minus, square
- **presentation**: chart
- **prohibit**: inset
- **question**: mark
- **radio**: button
- **rainbow**: cloud
- **receipt**: x
- **repeat**: once
- **rocket**: launch
- **rows**: plus-bottom, plus-top
- **scribble**: loop
- **seal**: check, percent, question, warning
- **selection**: all, background, foreground, inverse, plus, slash
- **share**: fat, network
- **shield**: check, checkered, chevron, plus, slash, star, warning
- **shuffle**: angular, simple
- **smiley**: angry, blank, meh, melting, nervous, sad, sticker, wink, x-eyes
- **sneaker**: move
- **spinner**: ball, gap
- **square**: half, half-bottom, logo, split-horizontal, split-vertical
- **stack**: minus, overflow-logo, plus, simple
- **star**: and-crescent, four, half, of-david
- **suitcase**: rolling, simple
- **sun**: dim, horizon
- **tag**: chevron, simple
- **terminal**: window
- **thermometer**: cold, hot, simple
- **toilet**: paper
- **trademark**: registered
- **train**: regional, simple
- **tray**: arrow-down, arrow-up
- **tree**: evergreen, palm, structure, view
- **trolley**: suitcase
- **truck**: trailer
- **user**: check, circle, circle-check, circle-dashed, circle-gear, circle-minus, circle-plus, focus, gear, list, minus, plus, rectangle, sound, square, switch
- **users**: four, three
- **video**: camera, camera-slash, conference
- **warning**: circle, diamond, octagon
- **wheelchair**: motion
- **x**: circle, logo, square

### 3. DEPENDENT ROOTS
`ph-{root}` is **NOT** valid. A suffix is required.

#### Shared suffix groups
- **[logo]**: amazon, android, angular, behance, coda, codepen, codesandbox, discord, dribbble, dropbox, facebook, fediverse, figma, framer, github, goodreads, instagram, lastfm, linkedin, linktree, linux, markdown, mastodon, matrix, medium, messenger, meta, notion, patreon, paypal, phosphor, pinterest, pix, reddit, replit, sketch, skype, slack, snapchat, soundcloud, spotify, steam, stripe, telegram, threads, tidal, tiktok, tumblr, twitch, twitter, webhooks, wechat, whatsapp, windows, youtube
- **[ball]**: beach, bowling, disco, soccer, tennis
- **[card]**: credit, graphics, sim
- **[down, up]**: escalator, thumbs, trend
- **[car]**: cable, police
- **[hat]**: chef, cowboy
- **[in, out]**: corners, sign
- **[four]**: diamonds, squares
- **[horizontal, vertical]**: flip, split
- **[arrow]**: flow, navigation
- **[than, than-or-equal]**: greater, less
- **[plant]**: nuclear, potted
- **[of, proper-of]**: subset, superset

#### Individual roots with suffixes
- **address**: book, book-tabs
- **air**: traffic-control
- **align**: bottom, bottom-simple, center-horizontal, center-horizontal-simple, center-vertical, center-vertical-simple, left, left-simple, right, right-simple, top, top-simple
- **app**: store-logo, window
- **apple**: logo, podcasts-logo
- **approximate**: equals
- **arrow**: arc-left, arc-right, bend-double-up-left, bend-double-up-right, bend-down-left, bend-down-right, bend-left-down, bend-left-up, bend-right-down, bend-right-up, bend-up-left, bend-up-right, circle-down, circle-down-left, circle-down-right, circle-left, circle-right, circle-up, circle-up-left, circle-up-right, clockwise, counter-clockwise, down, down-left, down-right, elbow-down-left, elbow-down-right, elbow-left, elbow-left-down, elbow-left-up, elbow-right, elbow-right-down, elbow-right-up, elbow-up-left, elbow-up-right, fat-down, fat-left, fat-line-down, fat-line-left, fat-line-right, fat-line-up, fat-lines-down, fat-lines-left, fat-lines-right, fat-lines-up, fat-right, fat-up, left, line-down, line-down-left, line-down-right, line-left, line-right, line-up, line-up-left, line-up-right, right, square-down, square-down-left, square-down-right, square-in, square-left, square-out, square-right, square-up, square-up-left, square-up-right, u-down-left, u-down-right, u-left-down, u-left-up, u-right-down, u-right-up, u-up-left, u-up-right, up, up-left, up-right
- **arrows**: clockwise, counter-clockwise, down-up, horizontal, in, in-cardinal, in-line-horizontal, in-line-vertical, in-simple, left-right, merge, out, out-cardinal, out-line-horizontal, out-line-vertical, out-simple, split, vertical
- **battery**: charging, charging-vertical, empty, full, high, low, medium, plus, plus-vertical, vertical-empty, vertical-full, vertical-high, vertical-low, vertical-medium, warning, warning-vertical
- **beer**: bottle, stein
- **bezier**: curve
- **bounding**: box
- **bowl**: food, steam
- **box**: arrow-down, arrow-up
- **boxing**: glove
- **brackets**: angle, curly, round, square
- **call**: bell
- **caret**: circle-double-down, circle-double-left, circle-double-right, circle-double-up, circle-down, circle-left, circle-right, circle-up, circle-up-down, double-down, double-left, double-right, double-up, down, left, line-down, line-left, line-right, line-up, right, up, up-down
- **cash**: register
- **cassette**: tape
- **castle**: turret
- **cell**: signal-full, signal-high, signal-low, signal-medium, signal-none, signal-slash, signal-x, tower
- **charging**: station
- **chart**: bar, bar-horizontal, donut, line, line-down, line-up, pie, pie-slice, polar, scatter
- **circles**: four, three, three-plus
- **closed**: captioning
- **coat**: hanger
- **computer**: tower
- **contactless**: payment
- **cooking**: pot
- **court**: basketball
- **currency**: btc, circle-dollar, cny, dollar, dollar-simple, eth, eur, gbp, inr, jpy, krw, kzt, ngn, rub
- **dev**: to-logo
- **device**: mobile, mobile-camera, mobile-slash, mobile-speaker, rotate, tablet, tablet-camera, tablet-speaker
- **dice**: five, four, one, six, three, two
- **dots**: nine, six, six-vertical, three, three-circle, three-circle-vertical, three-outline, three-outline-vertical, three-vertical
- **exclamation**: mark
- **face**: mask
- **fallout**: shelter
- **fast**: forward, forward-circle
- **film**: reel, script, slate, strip
- **finn**: the-human
- **first**: aid, aid-kit
- **floppy**: disk, disk-back
- **flying**: saucer
- **fork**: knife
- **four**: k
- **frame**: corners
- **game**: controller
- **gas**: can, pump
- **gender**: female, intersex, male, neuter, nonbinary, transgender
- **git**: branch, commit, diff, fork, merge, pull-request
- **gitlab**: logo, logo-simple
- **google**: cardboard-logo, chrome-logo, drive-logo, logo, photos-logo, play-logo, podcasts-logo
- **graduation**: cap
- **grid**: four, nine
- **hair**: dryer
- **hands**: clapping, praying
- **hard**: drive, drives, hat
- **head**: circuit
- **high**: definition, heel
- **ice**: cream
- **identification**: badge, card
- **letter**: circle-h, circle-p, circle-v
- **line**: segment, segments, vertical
- **magic**: wand
- **magnifying**: glass, glass-minus, glass-plus
- **map**: pin, pin-area, pin-line, pin-plus, pin-simple, pin-simple-area, pin-simple-line, trifold
- **marker**: circle
- **mask**: happy, sad
- **math**: operations
- **member**: of
- **microsoft**: excel-logo, outlook-logo, powerpoint-logo, teams-logo, word-logo
- **music**: note, note-simple, notes, notes-minus, notes-plus, notes-simple
- **not**: equals, member-of, subset-of, superset-of
- **number**: circle-eight, circle-five, circle-four, circle-nine, circle-one, circle-seven, circle-six, circle-three, circle-two, circle-zero, eight, five, four, nine, one, seven, six, square-eight, square-five, square-four, square-nine, square-one, square-seven, square-six, square-three, square-two, square-zero, three, two, zero
- **ny**: times-logo
- **office**: chair
- **open**: ai-logo
- **paint**: brush, brush-broad, brush-household, bucket, roller
- **paper**: plane, plane-right, plane-tilt
- **paw**: print
- **piano**: keys
- **picnic**: table
- **picture**: in-picture
- **piggy**: bank
- **ping**: pong
- **pint**: glass
- **poker**: chip
- **projector**: screen, screen-chart
- **push**: pin, pin-simple, pin-simple-slash, pin-slash
- **puzzle**: piece
- **qr**: code
- **read**: cv-logo
- **road**: horizon
- **security**: camera
- **shipping**: container
- **shirt**: folded
- **shooting**: star
- **shopping**: bag, bag-open, cart, cart-simple
- **skip**: back, back-circle, forward, forward-circle
- **solar**: panel, roof
- **sort**: ascending, descending
- **speaker**: hifi, high, low, none, simple-high, simple-low, simple-none, simple-slash, simple-x, slash, x
- **spray**: bottle
- **standard**: definition
- **steering**: wheel
- **swimming**: pool
- **t**: shirt
- **tea**: bag
- **test**: tube
- **text**: a-underline, aa, align-center, align-justify, align-left, align-right, b, bolder, columns, h, h-five, h-four, h-one, h-six, h-three, h-two, indent, italic, outdent, strikethrough, subscript, superscript, t, t-slash, underline
- **three**: d
- **tip**: jar
- **toggle**: left, right
- **traffic**: cone, sign, signal
- **treasure**: chest
- **vector**: three, two
- **vinyl**: record
- **virtual**: reality
- **washing**: machine
- **wave**: sawtooth, sine, square, triangle
- **wifi**: high, low, medium, none, slash, x
- **yin**: yang
