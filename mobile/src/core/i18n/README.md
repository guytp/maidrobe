# Internationalization (i18n) Guide

This directory contains the i18n configuration and translation files for the application.

## File Structure

- `index.ts` - i18n utilities and translation retrieval functions
- `en.json` - English translations (default locale)
- `README.md` - This documentation file

## Translation File Format

Translation files use nested JSON objects organized by feature and screen:

```json
{
  "screens": {
    "home": {
      "title": "Maidrobe",
      "accessibility": {
        "screenLabel": "Home screen"
      }
    }
  }
}
```

## Placeholder Syntax and Interpolation

### Template Syntax Convention

This i18n system uses **single curly braces** `{placeholder}` for dynamic value placeholders:

```json
{
  "cooldownMessage": "Please wait {seconds} seconds before resending",
  "greeting": "Hello {name}, you have {count} items"
}
```

**Supported syntax:**

- `{placeholder}` - Single curly braces (RECOMMENDED)

**NOT supported:**

- `{{placeholder}}` - Double curly braces (common in Handlebars/Mustache)
- `${placeholder}` - Dollar sign (JavaScript template literals)
- `%s`, `%d` - Printf-style placeholders
- `<placeholder>` - Angle brackets

### Manual Interpolation Pattern

This implementation uses **manual string replacement** instead of automatic interpolation. Dynamic values must be substituted using `.replace()`:

```typescript
// In en.json:
"cooldownMessage": "Please wait {seconds} seconds before resending"

// In component:
const message = t('screens.auth.verify.cooldownMessage')
  .replace('{seconds}', cooldownSeconds.toString());
```

### Multiple Placeholders

For strings with multiple dynamic values, chain `.replace()` calls:

```typescript
// In en.json:
"message": "Hello {name}, you have {count} items in {location}"

// In component:
const message = t('some.message')
  .replace('{name}', userName)
  .replace('{count}', itemCount.toString())
  .replace('{location}', locationName);
```

### Why Manual Interpolation?

**Advantages:**

- Simple and lightweight (no additional dependencies)
- Explicit control over value formatting and type conversion
- Full flexibility for custom formatting logic
- Type-safe translation keys via TypeScript
- Minimal bundle size impact

**Limitations:**

- No automatic pluralization support
- No automatic number/date formatting
- No gender agreement for languages that require it
- No nested object interpolation
- Manual HTML escaping required for user-generated content

## Best Practices

### 1. Placeholder Naming

Use descriptive, lowercase names for placeholders:

```json
// Good
"message": "Welcome {userName}, you joined on {registrationDate}"

// Avoid
"message": "Welcome {0}, you joined on {1}"
```

### 2. Consistent Formatting

Always use `.toString()` when replacing numeric values to ensure consistent formatting:

```typescript
// Good
.replace('{count}', itemCount.toString())

// Avoid (coerces to string implicitly)
.replace('{count}', itemCount)
```

### 3. Type Conversion Before Replacement

Handle formatting logic before interpolation:

```typescript
// Good
const formattedDate = formatDate(date, 'MMM DD, YYYY');
const message = t('message').replace('{date}', formattedDate);

// Avoid (complex logic in template)
const message = t('message').replace('{date}', new Date().toISOString());
```

### 4. Security Considerations

Always sanitize user-generated content before interpolation to prevent XSS:

```typescript
// Good
import { escapeHtml } from 'utils/security';
const message = t('message').replace('{userName}', escapeHtml(userInput));

// Dangerous (potential XSS)
const message = t('message').replace('{userName}', untrustedUserInput);
```

### 5. Accessibility Strings

Include accessibility-specific translations with dynamic content:

```json
{
  "accessibility": {
    "cooldownHint": "Cooldown: {seconds} seconds remaining"
  }
}
```

## Handling Pluralization

Since automatic pluralization is not supported, define separate translation keys:

```json
{
  "itemCount": "1 item",
  "itemCountPlural": "{count} items"
}
```

Then select the appropriate key in your component:

```typescript
const key = count === 1 ? 'itemCount' : 'itemCountPlural';
const message = t(key).replace('{count}', count.toString());
```

## RTL (Right-to-Left) Support

The i18n system includes RTL support for languages like Arabic and Hebrew. See `index.ts` for configuration functions:

- `isRTL(locale)` - Check if a locale uses RTL
- `configureRTL(locale)` - Configure app layout direction
- `forceRTL(enabled)` - Force RTL for testing

## Future Migration Path

If you need advanced features like automatic pluralization, gender agreement, or complex number/date formatting, consider migrating to a full-featured i18n library:

- **i18next** - Comprehensive i18n framework with extensive features
- **react-intl** - React-specific i18n with built-in formatting
- **Format.js** - Modern i18n with ICU MessageFormat support

The current `{placeholder}` syntax is compatible with most i18n libraries, making migration straightforward if needed.

## Examples

### Simple Translation (No Placeholders)

```typescript
import { t } from 'core/i18n';

const title = t('screens.home.title');
// Returns: "Maidrobe"
```

### Single Placeholder

```typescript
import { t } from 'core/i18n';

const cooldownSeconds = 30;
const message = t('screens.auth.verify.cooldownMessage').replace(
  '{seconds}',
  cooldownSeconds.toString()
);
// Returns: "Please wait 30 seconds before resending"
```

### Multiple Placeholders

```typescript
import { t } from 'core/i18n';

const greeting = t('some.greeting').replace('{name}', 'Alice').replace('{count}', '5');
// Returns: "Hello Alice, you have 5 items"
```

### Accessibility with Placeholders

```typescript
import { t } from 'core/i18n';

const hint = t('screens.auth.verify.accessibility.cooldownHint').replace('{seconds}', '45');
// Returns: "Cooldown: 45 seconds remaining"
```

## Adding New Translations

1. Add the translation string to `en.json` following the nested structure
2. Use descriptive keys that indicate the context and purpose
3. If the string needs dynamic values, use `{placeholder}` syntax
4. Update this README if introducing new conventions or patterns
5. TypeScript will automatically provide type-safe keys for new translations
