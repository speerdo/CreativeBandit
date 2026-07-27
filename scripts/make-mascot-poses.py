"""Builds three full-body bandit-cat poses around the existing head artwork.

The head is embedded verbatim from public/mascot/bandit-cat-head.svg so the
face keeps its original linework; only bodies and props are new. Body shapes
use inline fill/stroke attributes rather than classes, so nothing collides
with the head's own cls-* stylesheet.

Limbs and tails are stroked paths with round caps rather than filled
outlines - far easier to keep a constant, believable thickness through a
bend, and they read as limbs instead of blobs.

Overlapping bone-on-bone shapes are separated tonally (paper vs paper-dim)
rather than with keylines, since the head artwork has no outlines and adding
them only to the body would look grafted on.
"""
import re, pathlib, sys

OUT = pathlib.Path(sys.argv[1])
SRC = pathlib.Path("public/mascot/bandit-cat-head.svg").read_text()

DEFS = re.search(r'<defs>.*?</defs>', SRC, re.S).group()
HEAD = re.search(r'<g id="Layer_1-2"[^>]*>(.*)</g>\s*</svg>', SRC, re.S).group(1)
EYES = re.search(r'<g>\s*<path class="cls-4".*?</g>', HEAD, re.S).group()

PAPER, DIM, HOT, COLD, ACID, BASE = "#EDE8DF", "#D8D2C6", "#FF4D14", "#1B27E8", "#D9F24A", "#0B0B0C"

CLOSED = (
    '<g fill="none" stroke="#0B0B0C" stroke-width="7" stroke-linecap="round">'
    '<path d="M95,126 Q117,144 139,126"/>'
    '<path d="M180,126 Q202,144 224,126"/>'
    '</g>'
)
HEAD_ASLEEP = HEAD.replace(EYES, CLOSED)


def head(x, y, scale, rotate=0, asleep=False):
    body = HEAD_ASLEEP if asleep else HEAD
    rot = f' rotate({rotate})' if rotate else ''
    return f'<g transform="translate({x},{y}) scale({scale}){rot}">{body}</g>'


def limb(d, w=34, color=PAPER):
    return (f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{w}" '
            f'stroke-linecap="round" stroke-linejoin="round"/>')


def svg(name, w, h, title, parts):
    doc = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" '
        f'width="{w}" height="{h}" role="img" aria-labelledby="{name}-title">\n'
        f'  <title id="{name}-title">{title}</title>\n'
        f'  {DEFS}\n  ' + "\n  ".join(parts) + '\n</svg>\n'
    )
    (OUT / f'{name}.svg').write_text(doc)


def belt(cx, y, half, buckle_dx=22):
    """Echoes the hat band: dark strap, acid buckle. Kept narrow - a full-width
    strap reads as a black bar cutting the body in half."""
    return (f'<rect x="{cx-half}" y="{y}" width="{half*2}" height="13" fill="{BASE}" opacity="0.85"/>'
            f'<rect x="{cx+buckle_dx}" y="{y-3}" width="13" height="19" fill="{ACID}"/>')


def raygun(x, y, rot):
    """Little alien sidearm: bulbous blue barrel, orange grip, acid muzzle."""
    return (
        f'<g transform="translate({x},{y}) rotate({rot})">'
        f'<path d="M -6 -8 L 34 -8 Q 46 -8 46 0 Q 46 8 34 8 L -6 8 Z" fill="{COLD}"/>'
        f'<circle cx="16" cy="0" r="14" fill="{COLD}"/>'
        f'<circle cx="16" cy="0" r="5.5" fill="{ACID}"/>'
        f'<path d="M -6 3 L 8 3 L 3 30 L -13 30 Z" fill="{HOT}"/>'
        f'<rect x="42" y="-4.5" width="12" height="9" rx="3" fill="{ACID}"/>'
        f'</g>'
    )


def mini_ufo(x, y, scale, rot):
    return (
        f'<g transform="translate({x},{y}) scale({scale}) rotate({rot})">'
        f'<ellipse cx="0" cy="-8" rx="17" ry="15" fill="{PAPER}"/>'
        f'<ellipse cx="0" cy="0" rx="42" ry="12" fill="{COLD}"/>'
        f'<circle cx="-21" cy="4" r="3.6" fill="{ACID}"/>'
        f'<circle cx="0" cy="5" r="3.6" fill="{ACID}"/>'
        f'<circle cx="21" cy="4" r="3.6" fill="{ACID}"/>'
        f'</g>'
    )


# A seated torso, drawn top-behind so the head overlaps it and there is no
# floating gap at the neck.
def seated_torso(cx, top, bottom, half):
    return (f'<path d="M {cx} {top} '
            f'Q {cx+half*0.62} {top+8} {cx+half*0.92} {bottom-96} '
            f'Q {cx+half} {bottom} {cx+half*0.48} {bottom} '
            f'L {cx-half*0.48} {bottom} '
            f'Q {cx-half} {bottom} {cx-half*0.92} {bottom-96} '
            f'Q {cx-half*0.62} {top+8} {cx} {top} Z" fill="{PAPER}"/>')


# ---------------------------------------------------------------- sleeping
CX = 250
sleeping = [
    # tail curled right around the front of the curl
    limb(f"M 300 322 Q 392 322 396 276 Q 398 244 366 246 Q 344 248 344 268 "
         f"Q 344 284 360 282", 26, DIM),
    # curled body
    f'<path d="M 120 340 Q 74 340 72 300 Q 70 246 140 226 Q 224 204 292 236 '
    f'Q 344 262 340 304 Q 336 340 300 340 Z" fill="{PAPER}"/>',
    # far hind leg tucked, one tone down for separation
    f'<ellipse cx="286" cy="308" rx="52" ry="34" fill="{DIM}"/>',
    # folded front paws the head rests on
    limb("M 150 330 L 232 330", 30, DIM),
    f'<circle cx="150" cy="330" r="17" fill="{DIM}"/>',
    # head tipped onto the paws
    head(24, 132, 0.60, rotate=-13, asleep=True),
    # sleep marks
    f'<text x="336" y="150" font-family="Space Mono, monospace" font-size="40" '
    f'font-weight="700" fill="{ACID}">z</text>',
    f'<text x="378" y="106" font-family="Space Mono, monospace" font-size="28" '
    f'font-weight="700" fill="{ACID}" opacity="0.8">z</text>',
    f'<text x="410" y="74" font-family="Space Mono, monospace" font-size="20" '
    f'font-weight="700" fill="{ACID}" opacity="0.62">z</text>',
]

# ---------------------------------------------------------------- pistols
PX = 210
pistols = [
    # tail out to the right, behind everything
    limb("M 292 356 Q 372 352 376 300 Q 378 266 346 268 Q 324 270 324 290 "
         "Q 324 306 340 304", 26, DIM),
    seated_torso(PX, 150, 372, 104),
    # hind haunches
    f'<ellipse cx="{PX-72}" cy="328" rx="42" ry="34" fill="{DIM}"/>',
    f'<ellipse cx="{PX+72}" cy="328" rx="42" ry="34" fill="{DIM}"/>',
    # front legs and paws
    limb(f"M {PX-40} 300 L {PX-40} 358", 30),
    limb(f"M {PX+40} 300 L {PX+40} 358", 30),
    f'<ellipse cx="{PX-44}" cy="374" rx="27" ry="15" fill="{PAPER}"/>',
    f'<ellipse cx="{PX+44}" cy="374" rx="27" ry="15" fill="{PAPER}"/>',
    belt(PX, 290, 60),
    # arms akimbo: shoulder out to elbow, then in to the paw at the hip
    limb(f"M {PX-72} 214 Q {PX-136} 240 {PX-126} 288", 30),
    limb(f"M {PX+72} 214 Q {PX+136} 240 {PX+126} 288", 30),
    f'<circle cx="{PX-126}" cy="292" r="19" fill="{PAPER}"/>',
    f'<circle cx="{PX+126}" cy="292" r="19" fill="{PAPER}"/>',
    raygun(PX - 128, 292, -118),
    raygun(PX + 128, 292, -62),
    head(97, 4, 0.75),
]

# ---------------------------------------------------------------- batting
BX = 196
batting = [
    limb("M 274 358 Q 356 354 360 302 Q 362 268 330 270 Q 308 272 308 292 "
         "Q 308 308 324 306", 26, DIM),
    seated_torso(BX, 156, 374, 100),
    f'<ellipse cx="{BX-68}" cy="330" rx="40" ry="33" fill="{DIM}"/>',
    f'<ellipse cx="{BX+68}" cy="330" rx="40" ry="33" fill="{DIM}"/>',
    limb(f"M {BX-38} 304 L {BX-38} 360", 30),
    f'<ellipse cx="{BX-42}" cy="376" rx="27" ry="15" fill="{PAPER}"/>',
    limb(f"M {BX+38} 304 L {BX+38} 360", 30),
    f'<ellipse cx="{BX+42}" cy="376" rx="27" ry="15" fill="{PAPER}"/>',
    belt(BX, 294, 58),
    # resting arm
    limb(f"M {BX-70} 220 Q {BX-124} 250 {BX-114} 296", 30),
    f'<circle cx="{BX-114}" cy="300" r="19" fill="{PAPER}"/>',
    # swiping arm, up and out to the right
    limb(f"M {BX+66} 214 Q {BX+134} 194 {BX+150} 148", 30),
    f'<circle cx="{BX+152}" cy="140" r="22" fill="{PAPER}"/>',
    # toe beans on the swiping paw
    f'<circle cx="{BX+143}" cy="128" r="5" fill="{HOT}" opacity="0.6"/>',
    f'<circle cx="{BX+157}" cy="126" r="5" fill="{HOT}" opacity="0.6"/>',
    f'<circle cx="{BX+166}" cy="138" r="5" fill="{HOT}" opacity="0.6"/>',
    # the toy, knocked sideways
    mini_ufo(BX + 196, 106, 0.95, 22),
    # motion ticks trailing it
    f'<g stroke="{ACID}" stroke-width="4" stroke-linecap="round" fill="none" opacity="0.85">'
    f'<path d="M {BX+238} 74 L {BX+256} 62"/>'
    f'<path d="M {BX+246} 100 L {BX+268} 98"/>'
    f'<path d="M {BX+236} 132 L {BX+254} 142"/></g>',
    head(84, 8, 0.72),
]

svg("bandit-cat-sleeping", 470, 390, "Creative Bandit mascot asleep", sleeping)
svg("bandit-cat-pistols", 420, 400, "Creative Bandit mascot sitting with two ray guns", pistols)
svg("bandit-cat-batting", 480, 400, "Creative Bandit mascot batting at a tiny UFO", batting)
print("wrote 3 poses to", OUT)
