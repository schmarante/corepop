<p align="center">
  <img src="docs/logo.png" width="440" alt="corepop">
</p>

<p align="center"><b>Crack the core – color by color.</b></p>

<p align="center">
  <a href="https://schmarante.github.io/corepop/"><img src="https://img.shields.io/badge/%E2%96%B6%20Play%20now-schmarante.github.io%2Fcorepop-ff3d8b?style=for-the-badge" alt="Play now"></a>
</p>

corepop is a free color-sorting puzzle game in 3D. A figure made of candy-colored cubes floats in space – a football, a heart, a pirate ship … – and under its skin sits a colorful core, layered like a lollipop. Your spaceships take it apart, layer by layer:

- **Tap a ship** – it flies to the landing pad right above its column and only hits blocks of **its own color** that lie **on the very outside**. If there are none, it blocks its pad. All pads blocked: game over.
- **Swipe the front row** sideways to move ships under free pads. Whatever drops off the edge is gone for good – there is only a little spare ammo, so think before you swipe.
- **Blast crystals** – pulsing magenta cubes hidden in the inner layers. Hit one with a bomber and it explodes: the energy fades with distance and every cube in between, the blown-off cubes tumble into space one by one, bounce off the figure and fade into the dark.

<p align="center">
  <img src="docs/screenshot-pirate.webp" width="280" alt="The pirate ship boss level: three ships on their pads fire at the hull">
  &nbsp;
  <img src="docs/screenshot-blast.webp" width="280" alt="A crystal explodes inside the heart and flings the cubes into space">
</p>

13 handmade figures in comic style (including a pirate ship as a boss with over 10,000 cubes), up to three stars per level, unlockable specials (extra pad, recolor, supernova) and ship designs (paper plane, gummy bear, retro rocket, mini UFO). No sign-up, no ads, no tracking – progress stays in the browser. Languages: German and English.

## Development

The project runs in [DDEV](https://ddev.com) (Node only inside the container), packages via Yarn:

```sh
ddev yarn install   # dependencies
ddev yarn dev       # dev server with hot reload: https://corepop.localhost:4321/
ddev yarn build     # static site in dist/, served at https://corepop.localhost/
ddev yarn test      # Vitest: game logic, save game, translations, bot simulations
```

Build with `PUBLIC_DEBUG=true` for test keys in the game (**B** blasts a crystal, **W** wins the level, **P** unlocks everything) and the model overview at `/dev/modelle/`. Every push to `develop` is tested, built and deployed to GitHub Pages ([workflow](.github/workflows/static.yml)).

## Built with

corepop is built on great open-source projects. Thanks to everyone who contributes to them!

### In the game

| Project | Used for | License |
|---|---|---|
| [three.js](https://threejs.org) | 3D rendering | MIT |

### Font

| Project | Used for | License |
|---|---|---|
| [Sour Gummy](https://fonts.google.com/specimen/Sour+Gummy) | Logo lettering | OFL-1.1 |

### For building

| Project | Used for | License |
|---|---|---|
| [Astro](https://astro.build) | Generates the pages as static HTML | MIT |
| [Tailwind CSS](https://tailwindcss.com) | Styling (CSS) | MIT |
| [Vitest](https://vitest.dev) | Automated tests of the game logic | MIT |

---

Made by Marco Schrenk – [mail@marco-schrenk.de](mailto:mail@marco-schrenk.de)

<p align="center">Designed with ❤️. Powered by Claude.</p>
