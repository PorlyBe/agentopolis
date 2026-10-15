// wardrobe: the model of the transcript's latest assistant turn, and whether it runs with a 1M context window.
function wardrobe({ entries }) {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i], model = e.type === 'assistant' && e.message?.model
    if (!model || model === '<synthetic>') continue
    let req = e.requestedModel
    for (let j = i - 1; !req && j >= 0; j--) req = entries[j].requestedModel
    return { model, big: /\[1m\]/i.test(req || model) }
  }
}

export default { session: wardrobe, agent: wardrobe }
