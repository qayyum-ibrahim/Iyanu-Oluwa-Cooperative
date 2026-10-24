-- Written by hand (step 7.1): an index for the paidOn day range of payments.list.
-- CreateIndex
CREATE INDEX "Payment_paidOn_idx" ON "Payment"("paidOn");
