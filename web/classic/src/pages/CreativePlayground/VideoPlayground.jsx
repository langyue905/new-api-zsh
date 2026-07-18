/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or (at your
option) any later version.
*/

import React from 'react';
import EmbeddedPlayground from './EmbeddedPlayground';

export default function VideoPlayground() {
  return (
    <EmbeddedPlayground
      src='/playgrounds/video/index.html'
      title='Sora 2 Playground'
    />
  );
}
