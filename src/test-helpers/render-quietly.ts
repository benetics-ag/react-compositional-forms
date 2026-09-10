import React from 'react';
import {render} from '@testing-library/react';

/** Render `ui`, keeping a render-phase error out of the console before it is rethrown. */
export const renderQuietly = (ui: React.ReactElement) => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    return render(ui);
  } finally {
    spy.mockRestore();
  }
};
