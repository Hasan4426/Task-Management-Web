import React from 'react'

export default function Avatar({ name = '?', size = 'md', title }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || '?'
  return <span className={`avatar avatar-${size}`} title={title ?? name} aria-hidden="true">{initials}</span>
}
