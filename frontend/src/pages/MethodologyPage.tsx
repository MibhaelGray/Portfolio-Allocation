import React from 'react';
import { Link } from 'react-router-dom';

export default function MethodologyPage() {
  return (
    <article className="methodology">

      <p className="methodology-lede">
        This tool sizes portfolio positions using <strong>risk parity</strong>&mdash;a
        method that uses the full covariance matrix to equalize each asset&rsquo;s contribution
        to total portfolio risk. It accounts for both individual volatility <em>and</em> correlations
        between assets, automatically downsizing correlated clusters so that no single name or
        group of names dominates the portfolio&rsquo;s overall variance.
      </p>

      <p className="methodology-lede">
        Below is a complete walkthrough of the math, from raw price data to final dollar amounts.
      </p>

      {/* ── Section 1 ──────────────────────────── */}
      <h2>1. Daily Log Returns</h2>

      <p>
        Given a time series of closing prices P<sub>1</sub>, P<sub>2</sub>, &hellip;, P<sub>T</sub>,
        we compute the <em>logarithmic return</em> for each day:
      </p>

      <div className="formula">
        r<sub>t</sub> = ln(P<sub>t</sub> / P<sub>t&minus;1</sub>)
      </div>

      <h3>Why log returns instead of simple returns?</h3>

      <p>
        Simple (arithmetic) returns are defined as (P<sub>t</sub>&nbsp;&minus;&nbsp;P<sub>t&minus;1</sub>)&nbsp;/&nbsp;P<sub>t&minus;1</sub>.
        They work fine for single-period analysis, but log returns have two properties that make them
        better suited for volatility estimation:
      </p>

      <ol>
        <li>
          <strong>Time additivity.</strong> Log returns over multiple periods sum to the total log
          return: ln(P<sub>T</sub>/P<sub>0</sub>) = r<sub>1</sub> + r<sub>2</sub> + &hellip; + r<sub>T</sub>.
          This makes annualization straightforward.
        </li>
        <li>
          <strong>Symmetry.</strong> A +10% log return followed by a &minus;10% log return returns
          you to exactly where you started. Simple returns don&rsquo;t have this property&mdash;a
          +10% gain followed by a &minus;10% loss leaves you at 99% of your starting value.
        </li>
      </ol>

      <p>
        For the small daily moves typical of most stocks (under 5%), log and simple returns are
        nearly identical. The distinction matters more when working with volatile names or longer
        horizons.
      </p>

      {/* ── Section 2 ──────────────────────────── */}
      <h2>2. Realized Volatility</h2>

      <p>
        Realized volatility is the standard deviation of log returns over a trailing window of
        <em> n</em> trading days, annualized by the square root of 252 (the approximate number of
        trading days in a year):
      </p>

      <div className="formula">
        <div>
          &sigma;<sub>daily</sub> = std(r<sub>t&minus;n+1</sub>, r<sub>t&minus;n+2</sub>, &hellip;, r<sub>t</sub>)
        </div>
        <div style={{ marginTop: '0.5rem' }}>
          &sigma;<sub>annual</sub> = &sigma;<sub>daily</sub> &times; &radic;252
        </div>
      </div>

      <p>
        This is a <em>backward-looking</em> measure&mdash;it tells you how much the stock actually
        moved, not how much the market expects it to move (that would be <em>implied</em> volatility,
        derived from options prices). Realized vol is model-free: no assumptions about the
        distribution of returns, no parameters to fit.
      </p>

      <h3>The &radic;252 scaling factor</h3>

      <p>
        Volatility scales with the square root of time under the assumption that daily returns are
        roughly independent. If a stock moves about 1% per day, it doesn&rsquo;t move
        252% per year&mdash;because moves in opposite directions partially cancel out. Instead, the
        expected annual range is 1% &times; &radic;252 &asymp; 15.9%. This square-root scaling is
        why volatility grows more slowly than linearly with time.
      </p>

      <h3>Choosing the lookback window</h3>

      <p>
        The lookback window <em>n</em> controls the tradeoff between responsiveness and stability:
      </p>

      <table className="methodology-table">
        <thead>
          <tr>
            <th>Window</th>
            <th>Trading days</th>
            <th>Character</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>1 month</td><td>~21</td><td>Very reactive; a single volatile week dominates the estimate</td></tr>
          <tr><td>3 months</td><td>~63</td><td>Balanced; reflects the current regime without overreacting</td></tr>
          <tr><td>6 months</td><td>~126</td><td>Smooth; may include conditions no longer relevant</td></tr>
          <tr><td>1 year</td><td>~252</td><td>Very stable; slow to adapt to regime changes</td></tr>
        </tbody>
      </table>

      <p>
        A common rule of thumb: <strong>use half your intended holding period.</strong> For a
        6-month hold, a 63-day (3-month) lookback is a reasonable default. It&rsquo;s recent enough
        to capture the current vol regime but long enough that a single bad week doesn&rsquo;t
        distort your sizing.
      </p>

      {/* ── Section 3 ──────────────────────────── */}
      <h2>3. The Covariance Matrix</h2>

      <p>
        Individual volatility tells you how much each asset moves on its own, but it says nothing
        about how assets move <em>together</em>. The covariance matrix &Sigma; captures both:
      </p>

      <div className="formula">
        <div>
          &Sigma;<sub>ii</sub> = &sigma;<sub>i</sub><sup>2</sup> &nbsp;(variance&mdash;the diagonal)
        </div>
        <div style={{ marginTop: '0.5rem' }}>
          &Sigma;<sub>ij</sub> = &rho;<sub>ij</sub> &times; &sigma;<sub>i</sub> &times; &sigma;<sub>j</sub> &nbsp;(covariance&mdash;the off-diagonals)
        </div>
      </div>

      <p>
        The diagonal entries are each asset&rsquo;s variance (volatility squared). The off-diagonal
        entries combine the correlation &rho;<sub>ij</sub> between two assets with both their
        volatilities. This means the covariance matrix is a complete description of the portfolio&rsquo;s
        risk structure&mdash;it encodes both how much each asset moves and how they move relative
        to each other.
      </p>

      <p>
        We estimate &Sigma; from the same log-return series used for volatility, annualized by
        multiplying by 252. All tickers are downloaded in a single batch to ensure perfectly aligned
        dates&mdash;days where any market is closed are excluded so that correlations aren&rsquo;t
        distorted by stale prices.
      </p>

      {/* ── Section 4 ──────────────────────────── */}
      <h2>4. Risk Parity Weighting</h2>

      <p>
        Risk parity&mdash;also called <em>equal risk contribution</em>&mdash;finds the set of weights
        where every position contributes the same fraction of total portfolio risk. The risk
        contribution of asset <em>i</em> is defined as:
      </p>

      <div className="formula">
        <div>
          RC<sub>i</sub> = w<sub>i</sub> &times; (&Sigma;w)<sub>i</sub> / &sigma;<sup>2</sup><sub>p</sub>
        </div>
        <div style={{ marginTop: '0.5rem' }}>
          where &sigma;<sup>2</sup><sub>p</sub> = w<sup>T</sup>&Sigma;w &nbsp;(portfolio variance)
        </div>
      </div>

      <p>
        The optimizer minimizes &Sigma;(RC<sub>i</sub> &minus; 1/N)<sup>2</sup> subject to
        the constraint that weights sum to one and are all positive. When it converges, each
        asset&rsquo;s risk contribution is approximately 1/N&mdash;perfect risk balance.
      </p>

      <h3>Why correlations matter</h3>

      <p>
        Consider a portfolio with five semiconductor stocks and five unrelated names. Under
        simple inverse-volatility weighting, each semi stock might get a 7% weight if their
        vols are similar&mdash;totaling 35% of the portfolio in a single correlated cluster.
        Because these stocks tend to move together, a bad day for semis hits all five positions
        simultaneously. The actual risk concentration is far higher than the weights suggest.
      </p>

      <p>
        Risk parity fixes this. The covariance matrix reveals that the five semi stocks are
        highly correlated, so each one&rsquo;s marginal contribution to portfolio variance is
        amplified by the others. The optimizer responds by reducing their individual weights
        until the cluster&rsquo;s total risk contribution matches its fair share. The uncorrelated
        names, whose risk contributions aren&rsquo;t amplified, receive proportionally larger weights.
      </p>

      <h3>Comparison to inverse-volatility weighting</h3>

      <p>
        Inverse-vol weighting is a special case: it produces exact risk parity <em>only</em> when
        all pairwise correlations are equal. In practice, correlations vary widely&mdash;tech
        stocks co-move, a utility and a biotech do not. Risk parity generalizes inverse-vol
        by using the full covariance matrix, making it strictly more accurate for
        real-world portfolios where correlations differ.
      </p>

      {/* ── Section 5 ──────────────────────────── */}
      <h2>5. Position Sizing</h2>

      <p>
        The final dollar allocation for each position is simply the weight times your total capital:
      </p>

      <div className="formula">
        Position<sub>i</sub> = w<sub>i</sub> &times; Total Allocation
      </div>

      <p>
        The weights sum to 1.0 by construction, so the positions sum to the full allocation
        with no cash left over.
      </p>

      {/* ── Section 6 ──────────────────────────── */}
      <h2>6. Limitations and Practical Notes</h2>

      <ol>
        <li>
          <strong>Vol is not risk.</strong> Realized volatility captures price dispersion, but
          not tail risk, liquidity risk, or fundamental risk. A stock can have low vol right up
          until it gaps down 40% on an earnings miss.
        </li>
        <li>
          <strong>Backward-looking.</strong> Both volatility and correlations reflect the past.
          They adapt to new regimes only as fast as your lookback window allows. A sudden vol
          spike or a correlation breakdown won&rsquo;t be fully reflected for days or weeks.
        </li>
        <li>
          <strong>Covariance estimation noise.</strong> With a 63-day lookback and 14 assets,
          you&rsquo;re estimating 105 pairwise covariances from relatively few observations.
          The optimizer uses ridge regularization to prevent instability from noisy estimates,
          but the weights are still approximations&mdash;not exact risk targets.
        </li>
        <li>
          <strong>Small positions may be impractical.</strong> With a $5,000 allocation and 14
          names, some positions can be as small as $140&mdash;less than two shares of many stocks.
          Consider setting a minimum position floor or reducing the number of names.
        </li>
        <li>
          <strong>Currency effects.</strong> For international stocks (priced in EUR, KRW, etc.),
          the vol calculation uses local-currency returns. FX volatility is not captured, which
          means your USD-denominated risk may differ from what the numbers suggest.
        </li>
        <li>
          <strong>No rebalancing signal.</strong> This tool gives you a snapshot. In practice,
          you&rsquo;d want to recalculate periodically (weekly or monthly) and rebalance when
          weights drift materially from their targets.
        </li>
      </ol>

      {/* ── Section 7 ──────────────────────────── */}
      <h2>7. GARCH(1,1) Volatility Modeling</h2>

      <p>
        The realized volatility estimate above treats every day in the lookback window equally. But
        volatility <em>clusters</em>&mdash;large moves tend to follow large moves, and calm periods
        tend to persist. A stock that just dropped 8% in a day is likely to be more volatile tomorrow
        than its trailing 63-day average suggests.
      </p>

      <p>
        The GARCH(1,1) model captures this by making tomorrow&rsquo;s conditional variance a function
        of today&rsquo;s shock and today&rsquo;s conditional variance:
      </p>

      <div className="formula">
        <div>
          &sigma;<sup>2</sup><sub>t</sub> = &omega; + &alpha; &middot; &epsilon;<sup>2</sup><sub>t&minus;1</sub> + &beta; &middot; &sigma;<sup>2</sup><sub>t&minus;1</sub>
        </div>
      </div>

      <p>
        Here &omega; anchors the long-run variance level, &alpha; controls how strongly a new shock
        updates the variance (shock sensitivity), and &beta; controls how persistent the previous
        variance estimate is (memory). The sum &alpha;&nbsp;+&nbsp;&beta; is called <em>persistence</em>&mdash;values
        close to 1.0 mean volatility shocks decay slowly. Typical equity persistence is 0.93&ndash;0.98.
      </p>

      <h3>Unconditional variance and half-life</h3>

      <p>
        If persistence is below 1.0, the model has a well-defined long-run (unconditional)
        variance: &omega;&nbsp;/&nbsp;(1&nbsp;&minus;&nbsp;&alpha;&nbsp;&minus;&nbsp;&beta;).
        After a vol spike, the conditional variance reverts toward this level. The <em>half-life</em> of
        a shock&mdash;the number of days for its impact to decay by half&mdash;is &minus;ln(2)&nbsp;/&nbsp;ln(&alpha;&nbsp;+&nbsp;&beta;).
        With persistence of 0.95, the half-life is about 14 days.
      </p>

      <h3>Student-t innovations</h3>

      <p>
        Real stock returns have fatter tails than a Gaussian distribution predicts. The standard
        GARCH model assumes normally distributed shocks, which underestimates the frequency of
        extreme moves. We instead use <em>Student-t</em> distributed innovations, adding a degrees-of-freedom
        parameter &nu; that controls tail thickness. Lower &nu; means heavier tails. Typical equity
        values are 4&ndash;8, meaning roughly 3&ndash;6 times more frequent extreme moves than
        a Gaussian would predict.
      </p>

      {/* ── Section 8 ──────────────────────────── */}
      <h2>8. Correlated Multi-Asset Simulation</h2>

      <p>
        Each asset gets its own GARCH(1,1)-t model, but assets don&rsquo;t move independently.
        To preserve the cross-asset correlation structure in simulation, we use the <em>standardized
        residuals</em> from the GARCH fits.
      </p>

      <p>
        After fitting, each asset&rsquo;s standardized residuals should be roughly i.i.d. with no
        remaining volatility clustering. But they still retain their cross-asset correlations&mdash;if
        two semiconductor stocks tend to drop together, their residuals will be positively correlated.
        We estimate the correlation matrix of these residuals, then use <em>Cholesky decomposition</em> to
        generate correlated innovations during simulation.
      </p>

      <div className="formula">
        <div>C = L &middot; L<sup>T</sup> &nbsp;(Cholesky factorization of residual correlation matrix)</div>
        <div style={{ marginTop: '0.5rem' }}>
          &epsilon;<sub>correlated</sub> = L &middot; &epsilon;<sub>independent</sub>
        </div>
      </div>

      <p>
        For each simulation path, we step forward one trading day at a time:
      </p>

      <ol>
        <li>
          Draw independent Student-t variates for each asset (using that asset&rsquo;s fitted &nu;).
        </li>
        <li>
          Multiply by the Cholesky factor L to introduce cross-asset correlation.
        </li>
        <li>
          Scale by each asset&rsquo;s current conditional standard deviation &sigma;<sub>t</sub> to
          get daily returns.
        </li>
        <li>
          Update each asset&rsquo;s conditional variance via the GARCH equation for the next step.
        </li>
        <li>
          Compute the portfolio return as the weighted sum of asset returns, and compound the
          portfolio value.
        </li>
      </ol>

      <p>
        This process respects three key features simultaneously: per-asset volatility dynamics
        (GARCH), fat tails (Student-t), and cross-asset dependence (Cholesky correlation). The
        simulation assumes zero expected return (drift&nbsp;=&nbsp;0), because sample mean estimates
        from a 63-day window are far too noisy to be useful&mdash;this is a risk profiling tool,
        not a return forecasting tool.
      </p>

      {/* ── Section 9 ──────────────────────────── */}
      <h2>9. Interpreting the Simulation Output</h2>

      <h3>The fan chart</h3>

      <p>
        The fan chart shows how portfolio value might evolve over the simulation horizon. The bands
        represent percentile ranges: the darkest band covers the 25th&ndash;75th percentile
        (the middle 50% of outcomes), with progressively lighter bands extending to the
        5th&ndash;95th percentile (90% of outcomes). The solid line is the median path.
      </p>

      <p>
        Notice that bands widen over time&mdash;uncertainty compounds. Early in the simulation, the
        GARCH conditional variance is highly informative (it reflects the current vol regime), so
        bands are relatively tight. Over weeks and months, the conditional variance reverts toward
        its unconditional level, and bands widen as cumulative uncertainty grows.
      </p>

      <h3>Value at Risk and Expected Shortfall</h3>

      <p>
        <strong>VaR(5%)</strong> answers: &ldquo;What is the loss level that only 5% of simulated outcomes
        exceed?&rdquo; If your VaR(5%) is &minus;18%, there is a 5% chance you lose more than 18%
        of your allocation over the horizon.
      </p>

      <p>
        <strong>CVaR(5%)</strong>, also called <em>Expected Shortfall</em> or <em>Conditional VaR</em>,
        goes further: it asks &ldquo;Given that we&rsquo;re in the worst 5% of outcomes, what is the
        average loss?&rdquo; This captures the <em>severity</em> of tail events, not just their
        threshold. CVaR is always worse (more negative) than VaR.
      </p>

      <h3>Limitations of the simulation</h3>

      <ol>
        <li>
          <strong>Static correlations.</strong> The simulation uses a single correlation matrix estimated
          from the lookback window. In a real crisis, correlations tend to spike toward 1.0
          (&ldquo;all correlations go to one&rdquo;), meaning the simulation may understate
          tail risk from correlation breakdown.
        </li>
        <li>
          <strong>GARCH mean-reversion.</strong> With typical persistence of 0.95, conditional variance
          reverts to its unconditional level within 30&ndash;60 days. For long horizons (6&ndash;12 months),
          the GARCH effect is primarily a short-term benefit&mdash;it gives realistic near-term dynamics
          but converges to a constant-vol simulation over longer periods.
        </li>
        <li>
          <strong>No regime changes.</strong> The model assumes that the GARCH parameters and correlation
          structure remain stable through the entire horizon. Structural breaks, new macro regimes,
          or company-specific events are not captured.
        </li>
        <li>
          <strong>Zero drift.</strong> The simulation does not forecast expected returns. Estimating
          expected returns from 63 days of data would be statistically meaningless (the standard error
          of the mean dwarfs the estimate itself). The fan chart is centered on the starting allocation
          by design.
        </li>
      </ol>

      <div className="methodology-footer">
        <Link to="/">&larr; Back to calculator</Link>
      </div>
    </article>
  );
}
