/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or (at your
option) any later version.
*/

import React from 'react';

export default function EmbeddedPlayground({ src, title }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        background: 'var(--semi-color-bg-0)',
      }}
    >
      <iframe
        src={src}
        title={title}
        allow='clipboard-read; clipboard-write; fullscreen'
        style={{ width: '100%', height: '100%', border: 0 }}
      />
    </div>
  );
}
