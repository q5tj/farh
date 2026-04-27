import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

/**
 * Custom HTML wrapper for the web build.
 *
 * Crucial: forces html/body/#root to occupy the full viewport so that
 * React Navigation's bottom Tab bar (laid out via flex) anchors to the
 * bottom of the screen instead of falling below it on tall content.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: ROOT_CSS }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const ROOT_CSS = `
html, body, #root {
  height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
}
#root {
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
}
body {
  background-color: #fff;
}
`;
