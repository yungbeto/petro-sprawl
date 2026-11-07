// "Cite this page" at the end of every detail page: the citation as plain text, ready to copy into a story
// or a footnote, and a reminder that a figure's own source is the one to cite for the figure.

import { useEffect, useState } from 'react';
import { citation, citeUrl } from '../../lib/cite';
import { TextButton } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Note } from '../../ui/Note';
import { SectionTitle } from '../../ui/SectionTitle';

export function CiteThisPage({ title, kind }: { title: string; kind: string }) {
  const text = citation({ title, kind, url: citeUrl(window.location.search) });
  const [copied, setCopied] = useState(false);
  useEffect(() => setCopied(false), [text]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // No clipboard (an insecure origin, a denied permission): the text stays there to select by hand.
      setCopied(false);
    }
  };
  return (
    <section className="section cite">
      <SectionTitle title="Cite this page" />
      <Card subtle>
        <p className="cite__text">{text}</p>
        <TextButton className="cite__copy" onClick={copy} aria-live="polite">
          {copied ? 'Copied' : 'Copy citation'}
        </TextButton>
      </Card>
      <Note>For a figure, cite the source it links as well.</Note>
    </section>
  );
}
