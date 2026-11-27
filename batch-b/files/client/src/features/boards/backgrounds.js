// Must match BACKGROUNDS in server/src/features/boards/boards.shared.js
export const BACKGROUNDS = {
  blue: '#0079bf',
  orange: '#d29034',
  green: '#519839',
  red: '#b04632',
  purple: '#89609e',
  pink: '#cd5a91',
  lime: '#4bbf6b',
  sky: '#00aecc',
  grey: '#838c91',
}

export const backgroundColor = (name) => BACKGROUNDS[name] ?? BACKGROUNDS.blue
