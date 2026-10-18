"""Kitchen pass, step 1: palette, copy and asset references.
main.original.html -> main.html. Every pair must match at least once."""
import sys

SRC, DST = 'main.original.html', 'main.html'
s = open(SRC, encoding='utf-8').read()

def sub(old, new, count=None):
    global s
    n = s.count(old)
    if n == 0:
        sys.exit('NOT FOUND: ' + old[:90])
    if count is not None and n != count:
        sys.exit(f'COUNT {n} != {count}: ' + old[:90])
    s = s.replace(old, new)

# ------------------------------------------------------------------ assets
SUPA = 'https://ublctyddhtbgaersvxxb.supabase.co/storage/v1/object/public/threeui-media/scene-images/'
for old, new in {
    'temple-wall': 'fg-counter', 'pine-tree': 'fg-crate', 'tall-grass': 'fg-produce-bank',
    'sakura-branch': 'fg-spray-left', 'maple-leaves': 'fg-spray-right', 'stone-lantern': 'fg-jar-lamp',
    'garden-bush': 'fg-basket', 'basalt-stones': 'fg-tomato-heap', 'hill': 'fg-shelf', 'shrine-ruins': 'fg-stockpot',
}.items():
    sub(SUPA + '35388445965f970fa28af333/' + old + '.webp', 'kitchen-assets/' + new + '.webp')
for old, new in {
    'kage-sanmon-preview': 'scene-preview', 'kage-approach': 'scene-pantry',
    'kage-lantern-court': 'scene-market', 'kage-moonwater': 'scene-table',
}.items():
    sub(SUPA + '6884c5281949d2c3530ad4cf/' + old + '.webp', 'kitchen-assets/' + new + '.webp')
if SUPA in s.split('function __threeuiStorageImage')[1].split('</script>', 1)[1]:
    sys.exit('a remote asset is still referenced')

# ------------------------------------------------------------------ palette
# night temple (cold sage on blue-black, vermilion) -> kitchen after hours
# (cream on warm walnut-black, tomato orange)
for old, new in [
    ('223,231,224', '244,234,220'), ('#dfe7e0', '#f4eadc'), ('#e2ece5', '#f6ecdf'), ('#97a89c', '#c79a6c'),
    ('#aab4ad', '#c8b8a4'), ('#78837c', '#93836f'), ('#c2cdc5', '#d8cab8'), ('#b4bfb7', '#cbbca9'),
    ('#9aa5a0', '#ae9f8d'), ('#7d8781', '#938473'), ('#909b95', '#a59684'), ('#8b958f', '#9e8f7d'),
    ('#8f9a93', '#a29382'), ('#79847e', '#8f806f'),
    ('#e0231c', '#e8542a'), ('224,35,28', '232,84,42'), ('#ff5a3c', '#ff8a3d'),
    ('#05070a', '#0d0907'), ('0x05070a', '0x0d0907'), ('#0a0e12', '#15100c'),
    ('rgba(3,6,9', 'rgba(12,8,5'), ('rgba(3,6,8', 'rgba(12,8,5'), ('rgba(4,7,10', 'rgba(13,9,6'),
    ('rgba(4,6,9', 'rgba(13,9,6'), ('rgba(5,7,10', 'rgba(13,9,6'), ('rgba(3,5,8', 'rgba(12,8,5'),
    ("'rgb(226,236,229)'", "'rgb(250,238,222)'"), ("'rgb(198,214,203)'", "'rgb(240,210,172)'"),
    ("'rgb(150,170,157)'", "'rgb(214,150,92)'"),
    ('linear-gradient(150deg,#101a1d,#0a0d10 62%,#1a0c0b)', 'linear-gradient(150deg,#2a1a10,#120c08 62%,#2c140a)'),
    ('linear-gradient(160deg,#162326,#0b1013 55%,#241010)', 'linear-gradient(160deg,#2a1a10,#120c08 55%,#2c140a)'),
    ('rgba(120,150,158,.16)', 'rgba(190,140,90,.14)'),
]:
    sub(old, new)

# the Japanese face only ever carried kana and kanji; the kitchen labels are Latin
sub(".les h3 em{ font-style:normal; font-family:'NotoJP',sans-serif;", ".les h3 em{ font-style:normal; font-family:'Onest',sans-serif; text-transform:uppercase;")
sub(".jp{ font-family:'NotoJP','Onest',sans-serif; font-weight:400; }", ".jp{ font-family:'Onest',sans-serif; font-weight:400; text-transform:uppercase; }")

# the three stills each carry one warm source; the glows sit on them
sub('--gx:80.2%; --gy:23.9%; --gr:22%; --gt:6.1s; --gt2:9.7s; --gc1:rgba(255,142,108,.50); --gc2:rgba(212,56,38,.24)',
    '--gx:37.0%; --gy:5.5%; --gr:20%; --gt:6.1s; --gt2:9.7s; --gc1:rgba(255,206,130,.42); --gc2:rgba(236,140,50,.18)')
sub('--gx:70.5%; --gy:47.2%; --gr:14%; --gt:3.7s; --gt2:5.3s; --gc1:rgba(255,198,124,.62); --gc2:rgba(226,118,40,.30)',
    '--gx:13.0%; --gy:20.0%; --gr:14%; --gt:3.7s; --gt2:5.3s; --gc1:rgba(255,226,140,.52); --gc2:rgba(236,170,60,.24)')
sub('--gx:48.0%; --gy:16.8%; --gr:20%; --gt:7.3s; --gt2:11.2s; --gc1:rgba(255,138,104,.52); --gc2:rgba(208,54,36,.24)',
    '--gx:31.0%; --gy:30.0%; --gr:20%; --gt:7.3s; --gt2:11.2s; --gc1:rgba(255,246,206,.36); --gc2:rgba(250,214,130,.16)')

# ------------------------------------------------------------------ marks
OLD_PRE_MARK = '''        <circle cx="22" cy="24" r="9.5" stroke="#e8542a" stroke-width="1.2"/>
        <path d="M6 12h32M9.5 17h25M22 8v28" stroke="#f4eadc" stroke-width="1.2"/>'''
MARK = '''<circle cx="22" cy="25" r="9.2" fill="#e8542a" fill-opacity=".92"/>
        <path d="M22 16.2c-1.4-3.6-4.8-5-8.2-4.2 2.4 1.1 4.6 2.7 8.2 4.2zm0 0c1.6-3.4 4.8-4.8 8.2-3.9-2.5 1-4.6 2.5-8.2 3.9z" fill="#7fb24a"/>
        <path d="M6 37.5h32" stroke="#f4eadc" stroke-width="1.4"/>'''
sub(OLD_PRE_MARK, '        ' + MARK)
OLD_BRAND = '''      <circle cx="22" cy="25" r="8.6" fill="#e8542a" fill-opacity=".9"/>
      <path d="M5 13h34M9 18.4h26M22 8.5v27" stroke="#f4eadc" stroke-width="1.5"/>
      <path d="M14 35.5h16" stroke="#f4eadc" stroke-width="1.2" stroke-opacity=".6"/>'''
sub(OLD_BRAND, '      ' + MARK)
sub('''        <circle cx="22" cy="25" r="8.6" fill="#e8542a" fill-opacity=".9"/>
        <path d="M5 13h34M9 18.4h26M22 8.5v27" stroke="#f4eadc" stroke-width="1.5"/>''', '        ' + MARK)
sub("%3Crect width='32' height='32' fill='%2305070a'/%3E%3Ccircle cx='16' cy='17' r='8' fill='%23e0231c'/%3E%3Crect x='4' y='8' width='24' height='2.6' fill='%23dfe7e0'/%3E%3Crect x='7' y='13' width='18' height='2' fill='%23dfe7e0'/%3E",
    "%3Crect width='32' height='32' rx='7' fill='%230d0907'/%3E%3Ccircle cx='16' cy='18' r='8.5' fill='%23e8542a'/%3E%3Cpath d='M16 10c-1-3-4-4-7-3 2 1 4 2 7 3zm0 0c1-3 4-4 7-3-2 1-4 2-7 3z' fill='%237fb24a'/%3E")

# ------------------------------------------------------------------ copy
COPY = [
    ('<title>Kage — Where stillness reveals the unseen</title>', '<title>pAIntry — Every kitchen knows what it needs</title>'),
    ('content="A five-chapter night walk through a Kyoto mountain temple. Charred cypress, lantern light and a vermilion moon, rendered live in WebGL."',
     'content="pAIntry is an AI grocery assistant that knows your kitchen, your body and your budget. A five-chapter walk through a kitchen after hours, rendered live in WebGL."'),
    ('<div class="pre-jp jp">影の道</div>', '<div class="pre-jp jp">Mise en place</div>'),
    ('<span>Raising the mountain temple</span>', '<span>Stocking the pantry</span>'),
    ('<span class="brand-tx"><b>KAGE</b><i>HIDDEN REALMS OF KYOTO</i></span>', '<span class="brand-tx"><b>PAINTRY</b><i>YOUR KITCHEN, KNOWN</i></span>'),
    ('<span>Temples</span><span class="alt">伽藍</span>', '<span>Pantry</span><span class="alt">Pantry</span>'),
    ('<span>Gardens</span><span class="alt">庭園</span>', '<span>Market</span><span class="alt">Market</span>'),
    ('<span>Rituals</span><span class="alt">神事</span>', '<span>Recipe</span><span class="alt">Recipe</span>'),
    ('<span>Afterlight</span><span class="alt">残光</span>', '<span>Aftertaste</span><span class="alt">Aftertaste</span>'),
    ('Chapter 00 — The Hidden Gate', 'Chapter 00 — The Night Kitchen'),
    ('<span class="mask-line"><span>Where stillness</span></span>', '<span class="mask-line"><span>Every kitchen</span></span>'),
    ('<span class="mask-line"><span>reveals the</span></span>', '<span class="mask-line"><span>knows what</span></span>'),
    ('<span class="mask-line"><span>unseen.</span></span>', '<span class="mask-line"><span>it needs.</span></span>'),
    ('''<p class="hero-sub body" data-rv="up">Enter Kyoto through its quiet thresholds, where ritual,
      craft, and memory shape the path.</p>''',
     '''<p class="hero-sub body" data-rv="up">An AI grocery assistant that knows your pantry, your body
      and your budget, and tells you what to buy, where, and whether it is worth it.</p>'''),
    ('<span>Scroll to enter</span>', '<span>Scroll to cook</span>'),
    ('<b>Thresholds</b><p>Discover the hidden gates that open on to deeper paths.</p>',
     '<b>Pantry capture</b><p>Snap the fridge or a receipt. Every item and its expiry, found.</p>'),
    ('<b>Still Gardens</b><p>Witness the courts where silence gently unfolds.</p>',
     '<b>Convince me</b><p>Buy, skip or swap, with the reasons and the dollars saved.</p>'),
    ('<b>Sacred Craft</b><p>Embrace the hands and heritage that shape devotion.</p>',
     '<b>Smart list</b><p>Nutrition gaps become a budget-aware list across three stores.</p>'),
    ('<b>Night Rituals</b><p>Explore the rites that awaken when the day is done.</p>',
     '<b>Group cart</b><p>Roommates add, duplicates merge, the cost splits itself.</p>'),
    ('aria-label="Preview: Sanmon, before the bell"', 'aria-label="Preview: the kitchen, after hours"'),
    ('<span class="peek-cap"><b class="jp">山門</b><i>Sanmon — before the bell</i></span>',
     '<span class="peek-cap"><b class="jp">Prep</b><i>The kitchen — after hours</i></span>'),
    ('<div class="word-fb" aria-hidden="true">KAGE</div>', '<div class="word-fb" aria-hidden="true">PAINTRY</div>'),
    ('<span class="v jp">影の道</span>', '<span class="v jp">Mise en place</span>'),
    # chapter I
    ('<span class="k"><b>01</b> — The Sanmon</span><span class="rule"></span><span class="k jp">山門</span>',
     '<span class="k"><b>01</b> — The Pantry</span><span class="rule"></span><span class="k jp">Garde manger</span>'),
    ('<h2 class="display h-sec" data-rv="up">Charred cypress, worn stone, one gate left open.</h2>',
     '<h2 class="display h-sec" data-rv="up">A full fridge, an empty plan, one list that knows.</h2>'),
    ('''<p class="lead" data-rv="up">Kage begins where the city stops: a mountain gate of cedar burned black,
        standing in its own weather. The soot is not decoration. It is how a board is taught to survive a
        hundred rainy seasons, and the first thing this place asks you to understand.</p>''',
     '''<p class="lead" data-rv="up">pAIntry starts where most grocery runs go wrong: at a fridge nobody
        has really looked into. Text a photo of it, or of a receipt, and the pantry fills itself with
        items, quantities and expiry dates. You confirm them in one tap.</p>'''),
    ('''<p class="body" data-rv="up">Climb the worn steps and the worship hall lifts out of the mist, its paper
        screens lit from inside like a lantern the size of a house. Above the eaves a vermilion moon holds
        its place, patient, half hidden. Nothing here is in a hurry. Neither, for the next ninety minutes,
        are you.</p>''',
     '''<p class="body" data-rv="up">From there the kitchen does the thinking. Nutrition gaps turn into a
        shopping list, the list is priced across three stores, and every reason on every card links back
        to the data it came from. The code does the math; the model only writes the words.</p>'''),
    ('<span>Cross the threshold</span>', '<span>Open the pantry</span>'),
    ('<div><b>05</b><span>Chapters</span></div>', '<div><b>05</b><span>Features</span></div>'),
    ('<div><b>92</b><span>Minutes</span></div>', '<div><b>03</b><span>Stores compared</span></div>'),
    ('<div><b>1611</b><span>Hall raised</span></div>', '<div><b>&lt;3</b><span>Minute demo</span></div>'),
    ('<div><b>∞</b><span>Stillness</span></div>', '<div><b>$</b><span>Saved, every week</span></div>'),
    # chapter II
    ('<span class="k"><b>02</b> — Still Gardens</span><span class="rule"></span><span class="k jp">庭園</span>',
     '<span class="k"><b>02</b> — Three Kitchens</span><span class="rule"></span><span class="k jp">Le marche</span>'),
    ('<div class="card-lab"><b>Approach</b><span class="jp">参道</span></div>', '<div class="card-lab"><b>Pantry</b><span class="jp">Capture</span></div>'),
    ('<div class="card-meta"><span>The long climb</span><span>01 / 03</span></div>', '<div class="card-meta"><span>What you already have</span><span>01 / 03</span></div>'),
    ('<div class="card-lab"><b>Lanterns</b><span class="jp">灯籠</span></div>', '<div class="card-lab"><b>Market</b><span class="jp">Compare</span></div>'),
    ('<div class="card-meta"><span>Lantern court</span><span>02 / 03</span></div>', '<div class="card-meta"><span>Where it costs less</span><span>02 / 03</span></div>'),
    ('<div class="card-lab"><b>Moonwater</b><span class="jp">月影</span></div>', '<div class="card-lab"><b>Table</b><span class="jp">Decide</span></div>'),
    ('<div class="card-meta"><span>The wet court</span><span>03 / 03</span></div>', '<div class="card-meta"><span>What is worth it</span><span>03 / 03</span></div>'),
    # chapter III
    ('<span class="k"><b>03</b> — Sacred Craft</span><span class="rule"></span><span class="k jp">手業</span>',
     '<span class="k"><b>03</b> — The Recipe</span><span class="rule"></span><span class="k jp">Recette</span>'),
    ('<h2 class="display h-sec" data-rv="up">Five chapters. Ninety minutes. One quiet mind.</h2>',
     '<h2 class="display h-sec" data-rv="up">Five steps. Three minutes. One smarter cart.</h2>'),
    ('''<p class="body-lg" data-rv="up">Each chapter is a walk, not a lecture. You arrive at the gate, climb the
      steps, sit with the lantern, and leave with one thing worth keeping.</p>''',
     '''<p class="body-lg" data-rv="up">Each step is a moment in a real week, not a feature list. You open the
      fridge, plan the week, shop with friends, stand in the aisle, and check out knowing what you saved.</p>'''),
    ('''<h3>The Hidden Gate<em class="jp">山門</em></h3>
      <p>Why a gate is a sentence, and what you agree to when you walk under one.</p>
      <span class="t">14 min</span>''',
     '''<h3>Pantry Capture<em class="jp">Snap</em></h3>
      <p>Text a fridge photo or a receipt. Vision finds the items and the expiry dates.</p>
      <span class="t">Vision</span>'''),
    ('''<h3>Borrowed Scenery<em class="jp">借景</em></h3>
      <p>Shakkei: composing with a mountain you will never own.</p>
      <span class="t">18 min</span>''',
     '''<h3>Smart List<em class="jp">Plan</em></h3>
      <p>Nutrition gaps become a budget-aware list, priced across three stores.</p>
      <span class="t">Engine</span>'''),
    ('''<h3>Charred Cypress<em class="jp">焼杉</em></h3>
      <p>Yakisugi: burning a board black so the weather will let it live.</p>
      <span class="t">21 min</span>''',
     '''<h3>Group Cart<em class="jp">Share</em></h3>
      <p>Roommates add to the group chat. Duplicates merge and the cost splits.</p>
      <span class="t">iMessage</span>'''),
    ('''<h3>Lantern Light<em class="jp">灯籠</em></h3>
      <p>How a single ember decides the scale of everything around it.</p>
      <span class="t">17 min</span>''',
     '''<h3>Convince Me<em class="jp">Ask</em></h3>
      <p>In the aisle, ask “is this worth it?” and get buy, skip or swap, with the savings.</p>
      <span class="t">Voice</span>'''),
    ('''<h3>The Vermilion Moon<em class="jp">朱月</em></h3>
      <p>Why the moon burns red over the valley, and what the garden does with it.</p>
      <span class="t">22 min</span>''',
     '''<h3>Money Saved<em class="jp">Keep</em></h3>
      <p>A running ledger of swaps and rescued food, and what it added up to this week.</p>
      <span class="t">Ledger</span>'''),
    # chapter IV
    ('<div class="eyebrow" data-rv="fade">Chapter 04 — Afterlight</div>', '<div class="eyebrow" data-rv="fade">Chapter 04 — Aftertaste</div>'),
    ('<h2 class="display" data-rv="up">Afterlight</h2>', '<h2 class="display" data-rv="up">Aftertaste</h2>'),
    ('''<p class="body-lg" data-rv="up">The gate does not close behind you. Take the walk whenever the noise
    gets loud — it is always the same path, and never the same light.</p>''',
     '''<p class="body-lg" data-rv="up">The kitchen keeps learning after you close the fridge. Come back
    whenever the week gets busy: the same shelves, never the same list.</p>'''),
    ('<i></i><span>Begin the walk</span>', '<i></i><span>Start your pantry</span>'),
    # footer
    ('''<p>A five-chapter night walk through a Kyoto mountain temple. Three illustrated garden field notes
        sit inside a live Three.js sanctuary.</p>''',
     '''<p>An AI grocery assistant that knows your kitchen, your body and your budget. Built at
        DubHacks '26 for the Visa track, Reimagine Shopping.</p>'''),
    ('<li><a href="#gate" data-cursor>The Sanmon</a></li>', '<li><a href="#gate" data-cursor>The Pantry</a></li>'),
    ('<li><a href="#pathways" data-cursor>Still Gardens</a></li>', '<li><a href="#pathways" data-cursor>Three Kitchens</a></li>'),
    ('<li><a href="#lessons" data-cursor>Sacred Craft</a></li>', '<li><a href="#lessons" data-cursor>The Recipe</a></li>'),
    ('<li><a href="#eternity" data-cursor>Afterlight</a></li>', '<li><a href="#eternity" data-cursor>Aftertaste</a></li>'),
    ('<div><h4>Practice</h4><ul>', '<div><h4>Features</h4><ul>'),
    ('<li><a href="#lessons" data-cursor>Borrowed scenery</a></li>', '<li><a href="#lessons" data-cursor>Convince Me</a></li>'),
    ('<li><a href="#lessons" data-cursor>Lantern light</a></li>', '<li><a href="#lessons" data-cursor>Pantry capture</a></li>'),
    ('<li><a href="#lessons" data-cursor>Charred cypress</a></li>', '<li><a href="#lessons" data-cursor>Smart list</a></li>'),
    ('<li><a href="#lessons" data-cursor>Raked gravel</a></li>', '<li><a href="#lessons" data-cursor>Group cart</a></li>'),
    ('<div><h4>Elsewhere</h4><ul>', '<div><h4>Trust</h4><ul>'),
    ('<li><a href="#top" data-cursor>Journal</a></li>', '<li><a href="#top" data-cursor>“Why this?”</a></li>'),
    ('<li><a href="#top" data-cursor>Field notes</a></li>', '<li><a href="#top" data-cursor>Private health data</a></li>'),
    ('<li><a href="#top" data-cursor>Colophon</a></li>', '<li><a href="#top" data-cursor>Not medical advice</a></li>'),
    ('<span>© 2026 Kage — Kage no Michi</span>', '<span>© 2026 pAIntry — working name Cartwise</span>'),
    ('<span class="jp">静けさは一つの技である</span>', '<span class="jp">Code does the math</span>'),
    ('<span>WebGL · Onest · Kyoto</span>', "<span>WebGL · Onest · DubHacks '26</span>"),
    # the 3-D wordmark
    ("const word = 'KAGE', gl = [];", "const word = 'PAINTRY', gl = [];"),
]
for old, new in COPY:
    sub(old, new)

open(DST, 'w', encoding='utf-8').write(s)
print('ok', len(COPY), 'copy edits')
