"""
Rendu de fond des pages d'un modele PDF, pour l'apercu du questionnaire en
ligne (plans/2026-10-questionnaires-en-ligne.md, workspace).

    python -I scripts/formulaires/fonds.py <modele.pdf> <sortie.json> [--signature essai.png]

Ecrit [{largeur, hauteur, fond}] : dimensions en points et rendu JPEG en data
URL. `--signature` dessine en plus une signature factice pour l'essai de
`preparer.ts`. Besoin de PyMuPDF (pip install pymupdf).

Pour relever les places d'un nouveau document : PyMuPDF donne la position de
chaque caractere (`page.get_text("rawdict")`) et des petites images
(`page.get_image_info()`), qui sont souvent les cases a cocher.
"""

import base64
import json
import sys

import pymupdf

DPI = 120


def main() -> None:
    args = sys.argv[1:]
    if len(args) < 2:
        sys.exit(__doc__)
    modele, sortie = args[0], args[1]
    doc = pymupdf.open(modele)
    pages = []
    for page in doc:
        pix = page.get_pixmap(dpi=DPI)
        jpeg = pix.tobytes("jpeg", jpg_quality=72)
        pages.append(
            {
                "largeur": round(page.rect.width, 2),
                "hauteur": round(page.rect.height, 2),
                "fond": "data:image/jpeg;base64," + base64.b64encode(jpeg).decode(),
            }
        )
    with open(sortie, "w", encoding="utf-8") as f:
        json.dump(pages, f)
    print(f"{len(pages)} page(s), {sum(len(p['fond']) for p in pages) // 1024} Ko de fond")

    if "--signature" in args:
        chemin = args[args.index("--signature") + 1]
        essai = pymupdf.open()
        p = essai.new_page(width=300, height=90)
        forme = p.new_shape()
        forme.draw_bezier((20, 60), (60, 0), (90, 100), (130, 40))
        forme.draw_bezier((130, 40), (170, 0), (200, 80), (280, 30))
        forme.finish(color=(0.05, 0.1, 0.4), width=4, closePath=False)
        forme.commit()
        p.get_pixmap(dpi=72, alpha=True).save(chemin)


if __name__ == "__main__":
    main()
