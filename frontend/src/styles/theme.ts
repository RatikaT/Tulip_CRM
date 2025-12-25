/**
 * Design System Theme - Tulip CRM
 * Clean, modern UI design tokens
 */

export const theme = {
  // Colors - Professional Healthcare Palette
  colors: {
    // Backgrounds
    background: '#FAFAFA',     // Soft white
    surface: '#FFFFFF',        // Pure white for cards

    // Text
    textPrimary: '#1A1A1A',    // Near black
    textSecondary: '#666666',  // Muted gray
    textTertiary: '#999999',   // Light gray

    // Brand Colors - HCL Healthcare style (Navy + Orange)
    brandNavy: '#1E4088',       // Navy blue - primary brand
    brandNavyDark: '#162D5E',   // Darker navy
    brandOrange: '#F7941D',     // Orange - accent/CTA
    brandOrangeLight: '#FDB347', // Lighter orange

    // Tulip logo colors (for logo display)
    tulipPurple: '#7B4B94',
    tulipPink: '#E84A8A',

    // Accent - Strategic Use Only
    accent: '#F7941D',         // Orange for CTAs
    accentHover: '#E08015',    // Darker orange on hover
    accentLight: '#FFF8F0',    // Very light orange for hover backgrounds

    // Semantic Colors
    success: '#10B981',        // Emerald green
    error: '#EF4444',          // Red for errors
    warning: '#F59E0B',        // Amber
    info: '#3B82F6',           // Blue

    // Borders & Dividers
    border: '#E5E5E5',         // Subtle borders
    borderHover: '#CCCCCC',    // Hover state
    borderFocus: '#F7941D',    // Orange accent on focus
    divider: '#F0F0F0',        // Divider lines
  },

  // Typography
  typography: {
    fontFamily: `-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Segoe UI', system-ui, sans-serif`,

    // Sizes
    sizes: {
      hero: '48px',
      heading: '32px',
      subheading: '20px',
      body: '16px',
      small: '14px',
      tiny: '12px',
    },

    // Weights
    weights: {
      bold: 700,
      semibold: 600,
      medium: 500,
      normal: 400,
    },

    // Line Heights
    lineHeights: {
      tight: 1.2,
      normal: 1.5,
      relaxed: 1.75,
    },

    // Letter Spacing
    letterSpacing: {
      tight: '-0.5px',
      normal: '0',
      wide: '0.5px',
    },
  },

  // Spacing - 8px-based system
  spacing: {
    xs: '8px',
    sm: '16px',
    md: '24px',
    lg: '32px',
    xl: '48px',
    '2xl': '64px',
    '3xl': '96px',
  },

  // Border Radius
  radius: {
    sm: '6px',   // Inputs
    md: '8px',   // Buttons
    lg: '12px',  // Cards
    xl: '16px',  // Modals
    full: '9999px', // Circular
  },

  // Shadows - Subtle, not heavy
  shadows: {
    none: 'none',
    sm: '0 1px 2px rgba(0, 0, 0, 0.04)',
    md: '0 1px 3px rgba(0, 0, 0, 0.06)',
    lg: '0 4px 12px rgba(0, 0, 0, 0.08)',
    xl: '0 8px 24px rgba(0, 0, 0, 0.1)',

    // Focus shadow for inputs
    focus: '0 0 0 3px rgba(247, 148, 29, 0.15)',

    // Button hover shadow
    button: '0 4px 12px rgba(247, 148, 29, 0.25)',
  },

  // Transitions
  transitions: {
    fast: '150ms ease',
    normal: '250ms ease',
    slow: '350ms ease',
  },

  // Z-index
  zIndex: {
    dropdown: 1000,
    sticky: 1020,
    fixed: 1030,
    modalBackdrop: 1040,
    modal: 1050,
    popover: 1060,
    tooltip: 1070,
  },

  // Breakpoints for responsive design
  breakpoints: {
    mobile: '640px',
    tablet: '768px',
    desktop: '1024px',
    wide: '1280px',
  },
};

// Export individual token groups for convenience
export const {
  colors,
  typography,
  spacing,
  radius,
  shadows,
  transitions,
  zIndex,
  breakpoints,
} = theme;

export default theme;
