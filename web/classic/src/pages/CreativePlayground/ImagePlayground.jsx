/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or (at your
option) any later version.
*/

import React from 'react';
import EmbeddedPlayground from './EmbeddedPlayground';

export default function ImagePlayground() {
  const search = new URLSearchParams({
    apiUrl: `${window.location.origin}/v1`,
    apiMode: 'images',
    model: 'gpt-image-2',
    profileName: 'New API',
  });

  return (
    <EmbeddedPlayground
      src={`/playgrounds/image/index.html?${search.toString()}`}
      title='GPT Image Playground'
    />
  );
}
