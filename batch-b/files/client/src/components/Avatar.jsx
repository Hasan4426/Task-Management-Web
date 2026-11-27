import React from 'react'

// Round initials badge, like Trello's member avatars.
export default function Avatar({ name = '?', size = 'md', title }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || '?'
  return <span className={`avatar avatar-${size}`} title={title ?? name} aria-hidden="true">{initials}</span>
}
