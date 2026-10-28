"""Hydrogen's DMG window background (350x518 pt at 2x): the Balmer lines as
faint light flowing from the app down to Applications, with ink chevrons."""

import sys

import icon_svg

WIDTH, HEIGHT = 700, 1036


def svg():
    lines = []
    for wavelength, halo, _core, strength in icon_svg.BALMER:
        x = 350 + (icon_svg.line_x(wavelength) - 512) * 0.25
        lines.append(f'<rect x="{x - 9:.1f}" y="380" width="18" height="250" rx="9" fill="{halo}" opacity="{0.55 * strength:.2f}" filter="url(#bloom)"/>')
        lines.append(f'<rect x="{x - 2.5:.1f}" y="392" width="5" height="226" rx="2.5" fill="url(#fade-{wavelength:.0f})"/>')
        lines.append(f'<linearGradient id="fade-{wavelength:.0f}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{halo}" stop-opacity="0"/>'
                     f'<stop offset="0.5" stop-color="{halo}" stop-opacity="{0.8 * strength:.2f}"/><stop offset="1" stop-color="{halo}" stop-opacity="0"/></linearGradient>')
    chevrons = "".join(f'<path d="M332 {y} l18 16 l18 -16" fill="none" stroke="#9AA0AA" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="{o}"/>'
                       for y, o in ((470, 0.45), (500, 0.7), (530, 1.0)))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}">'
            '<defs><linearGradient id="paper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#EEF0F3"/></linearGradient>'
            '<filter id="bloom" x="-200%" y="-20%" width="500%" height="140%"><feGaussianBlur stdDeviation="16"/></filter></defs>'
            f'<rect width="{WIDTH}" height="{HEIGHT}" fill="url(#paper)"/>{"".join(lines)}{chevrons}</svg>')


if __name__ == "__main__":
    print(svg())
