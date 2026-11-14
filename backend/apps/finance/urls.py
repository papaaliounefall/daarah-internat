from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("finance/fees", views.FeeScheduleViewSet, basename="finance-fee")
router.register("finance/discounts", views.StudentDiscountViewSet, basename="finance-discount")
router.register("finance/dues", views.DueViewSet, basename="finance-due")
router.register("payments", views.PaymentViewSet, basename="payment")
router.register("expenses", views.ExpenseViewSet, basename="expense")
# Alias sous le préfixe finance (mêmes vues, mêmes droits).
router.register("finance/payments", views.PaymentViewSet, basename="finance-payment")
router.register("finance/expenses", views.ExpenseViewSet, basename="finance-expense")

urlpatterns = [
    path("finance/arrears/", views.ArrearsView.as_view(), name="finance-arrears"),
    path("finance/summary/", views.SummaryView.as_view(), name="finance-summary"),
    path("finance/my-children-payments/", views.MyChildrenPaymentsView.as_view(), name="finance-my-children-payments"),
    *router.urls,
]
