/**
 * UI surfaces (§7).
 *
 * The extensions drawer holds settings only. Everything the DM touches during
 * play—hero sheet, review queue, board—sits behind a FAB; a surface that waits
 * for a click is a surface that gets opened late.
 */

/**
 * Renders the settings template into the extensions panel.
 * @param {object} options
 * @param {string} options.folder extension folder, e.g. 'third-party/Sidekick'
 * @param {() => object} options.context getContext
 * @returns {Promise<void>}
 */
export async function mountSettings({ folder, context }) {
    const { renderExtensionTemplateAsync } = context();
    const html = await renderExtensionTemplateAsync(folder, 'settings', {});
    $('#extensions_settings2').append(html);
}

/**
 * Mounts the floating action button and the surfaces behind it.
 * @throws {Error} not implemented yet
 */
export function mountFab() {
    throw new Error('Sidekick: the FAB is not implemented yet');
}
